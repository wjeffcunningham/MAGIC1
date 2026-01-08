// /js/settings.js
import { getProfile, saveProfile, uploadAvatar } from "./db.js";

/* -------------------------------------------------------
   DOM ELEMENTS
-------------------------------------------------------- */
const notLogged   = document.getElementById("not-logged");
const settings    = document.getElementById("settings-area");

const emailInput  = document.getElementById("email-input");
const nameInput   = document.getElementById("name-input");
const remoteSel   = document.getElementById("remote-input");
const bioInput    = document.getElementById("bio-input");
const avatarImg   = document.getElementById("avatar-img");
const fileInput   = document.getElementById("image-file");
const saveBtn     = document.getElementById("save-btn");
const statusEl    = document.getElementById("status");

const displayHandleWrap = document.getElementById("display-handle-wrap");
const displayHandle     = document.getElementById("display-handle");

/* -------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

function normaliseHandle(h) {
  return (h || "").trim().toLowerCase();
}

function validHandle(h) {
  return /^[a-z0-9_]{3,20}$/.test(h);
}

/* -------------------------------------------------------
   LOAD PROFILE
-------------------------------------------------------- */
async function init() {
  setStatus("Loading profile…");

  const profile = await getProfile();

  if (!profile) {
    if (notLogged) notLogged.style.display = "block";
    if (settings)  settings.style.display  = "none";
    setStatus("You must be logged in to edit settings.");
    return;
  }

  if (notLogged) notLogged.style.display = "none";
  if (settings)  settings.style.display  = "block";

  // Email (read-only)
  if (emailInput) emailInput.value = profile.email || "";

  // Moderated display handle (authoritative if present)
  if (profile.moderated_handle) {
    if (displayHandle) displayHandle.textContent = profile.moderated_handle;
    if (displayHandleWrap) displayHandleWrap.style.display = "block";
  } else {
    if (displayHandleWrap) displayHandleWrap.style.display = "none";
  }

  // User handle (always editable, even if overridden)
  if (nameInput) {
    nameInput.readOnly = false;
    nameInput.value = profile.handle || "";
  }

  // Remote preference
  if (remoteSel) {
    remoteSel.value = profile.remote_preference || "no_remote";
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
      avatarImg.src = "/assets/default-avatar.png";
    }
  }

  setStatus("");
}

/* -------------------------------------------------------
   AVATAR UPLOAD (OPTIONAL / FUTURE)
-------------------------------------------------------- */
if (fileInput) {
  fileInput.addEventListener("change", async (evt) => {
    const file = evt.target.files?.[0];
    if (!file) return;

    setStatus("Uploading image…");

    const { url, error } = await uploadAvatar(file);
    if (error) {
      console.error(error);
      setStatus("Image upload failed.");
      return;
    }

    if (avatarImg && url) avatarImg.src = url;

    const { error: saveErr } = await saveProfile({ avatar_url: url });
    if (saveErr) {
      console.error(saveErr);
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

    // Handle (self-rename always allowed)
    if (nameInput) {
      const newHandle = normaliseHandle(nameInput.value);

      if (!newHandle) {
        updates.handle = null;
      } else if (!validHandle(newHandle)) {
        setStatus("Handle must be 3–20 characters: a–z, 0–9, underscore.");
        saveBtn.disabled = false;
        return;
      } else {
        updates.handle = newHandle;
      }
    }

    // Remote preference
    if (remoteSel) {
      updates.remote_preference = remoteSel.value || "no_remote";
    }

    // Bio
    if (bioInput) {
      updates.bio = bioInput.value.trim() || null;
    }

    const { error } = await saveProfile(updates);

    if (error) {
      console.error(error);
      setStatus("Save failed.");
    } else {
      setStatus("Settings saved.");
    }

    saveBtn.disabled = false;
  });
}

/* -------------------------------------------------------
   INIT
-------------------------------------------------------- */
init();