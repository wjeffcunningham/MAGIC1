// /js/settings.js
import { getProfile, saveProfile, uploadAvatar } from "./db.js";

/* -------------------------------------------------------
   DOM ELEMENTS
-------------------------------------------------------- */
const notLogged   = document.getElementById("not-logged");
const settings    = document.getElementById("settings-area");

const emailInput  = document.getElementById("email-input");
const nameInput   = document.getElementById("name-input");     // user handle (one-time)
const remoteSel   = document.getElementById("remote-input");
const bioInput    = document.getElementById("bio-input");
const avatarImg   = document.getElementById("avatar-img");
const fileInput   = document.getElementById("image-file");
const saveBtn     = document.getElementById("save-btn");
const statusEl    = document.getElementById("status");

const displayHandleWrap = document.getElementById("display-handle-wrap");
const displayHandle     = document.getElementById("display-handle");

/* -------------------------------------------------------
   LOCAL STATE
-------------------------------------------------------- */
let currentProfile = null;
let handleLocked   = false;

/* -------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
function setStatus(msg) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
}

function normaliseHandle(h) {
  if (!h) return "";
  return h.trim().toLowerCase();
}

/* -------------------------------------------------------
   LOAD PROFILE
-------------------------------------------------------- */
async function init() {
  setStatus("Loading profile…");

  const profile = await getProfile();
  currentProfile = profile;

  if (!profile) {
    if (notLogged)   notLogged.style.display = "block";
    if (settings)    settings.style.display  = "none";
    setStatus("You must be logged in to edit settings.");
    return;
  }

  if (notLogged)   notLogged.style.display = "none";
  if (settings)    settings.style.display  = "block";

  // Email (read-only)
  if (emailInput) emailInput.value = profile.email || "";

  // Display handle from moderated_handle or handle
  const dh = profile.moderated_handle || profile.handle || "";
  if (displayHandle)      displayHandle.textContent = dh || "(not set)";
  if (displayHandleWrap)  displayHandleWrap.style.display = dh ? "block" : "none";

  // Handle editable ONCE:
  handleLocked = !!profile.handle;

  if (nameInput) {
    if (profile.handle) {
      nameInput.value = profile.handle;
      nameInput.readOnly = true;
      nameInput.style.background = "#f0f0f0";
      nameInput.style.cursor = "not-allowed";
    } else {
      nameInput.value = "";
      nameInput.readOnly = false;
    }
  }

  // Remote preference
  if (remoteSel) {
    const val = profile.remote_preference || "no_remote";
    remoteSel.value = val;
  }

  // Bio
  if (bioInput) {
    bioInput.value = profile.bio || "";
  }

  // Avatar
  if (avatarImg) {
    if (profile.avatar_url) {
      avatarImg.src = profile.avatar_url;
    } else {
      avatarImg.removeAttribute("src");
    }
  }

  setStatus("");
}

/* -------------------------------------------------------
   AVATAR UPLOAD
-------------------------------------------------------- */
if (fileInput) {
  fileInput.addEventListener("change", async (evt) => {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;

    setStatus("Uploading image…");

    const { url, error } = await uploadAvatar(file);
    if (error) {
      console.error("uploadAvatar error", error);
      setStatus("Image upload failed.");
      return;
    }

    if (avatarImg && url) {
      avatarImg.src = url;
    }

    const { error: saveErr } = await saveProfile({ avatar_url: url });
    if (saveErr) {
      console.error("saveProfile avatar_url error", saveErr);
      setStatus("Saved image, but failed to update profile.");
      return;
    }

    setStatus("Avatar updated.");
  });
}

/* -------------------------------------------------------
   SAVE SETTINGS
-------------------------------------------------------- */
if (saveBtn) {
  saveBtn.addEventListener("click", async () => {
    setStatus("Saving…");
    saveBtn.disabled = true;

    const updates = {};

    // Handle – only if not previously set
    if (!handleLocked && nameInput) {
      const raw = nameInput.value || "";
      const newHandle = normaliseHandle(raw);

      if (newHandle) {
        // 3–20 chars, letters/digits/_ only
        if (!/^[a-z0-9_]{3,20}$/.test(newHandle)) {
          setStatus("Handle must be 3–20 chars, letters/numbers/underscore only.");
          saveBtn.disabled = false;
          return;
        }
        updates.handle = newHandle;
      } else {
        updates.handle = null;
      }
    }

    // Remote preference
    if (remoteSel) {
      updates.remote_preference = remoteSel.value || "no_remote";
    }

    // Bio
    if (bioInput) {
      updates.bio = (bioInput.value || "").trim() || null;
    }

    const { error } = await saveProfile(updates);

    if (error) {
      console.error("saveProfile error", error);
      setStatus("Save failed: " + (error.message || "unknown error"));
    } else {
      setStatus("Settings saved.");
      // If handle was just set, lock it in UI
      if (!handleLocked && updates.handle) {
        handleLocked = true;
        if (nameInput) {
          nameInput.value = updates.handle;
          nameInput.readOnly = true;
          nameInput.style.background = "#f0f0f0";
          nameInput.style.cursor = "not-allowed";
        }
      }
    }

    saveBtn.disabled = false;
  });
}

/* -------------------------------------------------------
   INIT
-------------------------------------------------------- */
init();