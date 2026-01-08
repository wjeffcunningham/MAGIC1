// /js/settings.js
import { supabase } from "./config.js";
import { saveProfile, uploadAvatar } from "./db.js";

/* -------------------------------------------------------
   DOM ELEMENTS
-------------------------------------------------------- */
const notLogged   = document.getElementById("not-logged");
const settings   = document.getElementById("settings-area");

const emailInput = document.getElementById("email-input");
const nameInput  = document.getElementById("name-input");
const remoteSel  = document.getElementById("remote-input");
const bioInput   = document.getElementById("bio-input");
const avatarImg  = document.getElementById("avatar-img");
const fileInput  = document.getElementById("image-file");
const saveBtn    = document.getElementById("save-btn");
const statusEl   = document.getElementById("status");

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
  if (statusEl) statusEl.textContent = msg || "";
}

function normaliseHandle(h) {
  return (h || "").trim().toLowerCase();
}

/* -------------------------------------------------------
   INIT (AUTH FIRST)
-------------------------------------------------------- */
async function init() {
  setStatus("Checking login…");

  const { data } = await supabase.auth.getUser();
  const user = data?.user || null;

  // 🔒 AUTH GATE
  if (!user) {
    if (notLogged) notLogged.style.display = "block";
    if (settings)  settings.style.display  = "none";
    setStatus("Please sign in to edit your settings.");
    return;
  }

  // 🔓 AUTH OK
  if (notLogged) notLogged.style.display = "none";
  if (settings)  settings.style.display  = "block";

  // Email always comes from auth (truth source)
  if (emailInput) emailInput.value = user.email || "";

  setStatus("Loading profile…");

  // Try loading profile (non-fatal if missing)
  const { data: profile } = await supabase
    .from("site_users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  currentProfile = profile || {};

  // Display handle (moderated or user handle)
  const dh =
    currentProfile.moderated_handle ||
    currentProfile.handle ||
    "";

  if (displayHandle)      displayHandle.textContent = dh || "(not set)";
  if (displayHandleWrap)  displayHandleWrap.style.display = dh ? "block" : "none";

  // Handle editable once
  handleLocked = !!currentProfile.handle;

  if (nameInput) {
    if (handleLocked) {
      nameInput.value = currentProfile.handle;
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
    remoteSel.value = currentProfile.remote_preference || "no_remote";
  }

  // Bio
  if (bioInput) {
    bioInput.value = currentProfile.bio || "";
  }

  // Avatar
  if (avatarImg && currentProfile.avatar_url) {
    avatarImg.src = currentProfile.avatar_url;
  }

  setStatus("");
}

/* -------------------------------------------------------
   AVATAR UPLOAD
-------------------------------------------------------- */
if (fileInput) {
  fileInput.addEventListener("change", async (evt) => {
    const file = evt.target.files?.[0];
    if (!file) return;

    setStatus("Uploading image…");

    const { url, error } = await uploadAvatar(file);
    if (error) {
      setStatus("Image upload failed.");
      return;
    }

    if (avatarImg) avatarImg.src = url;
    await saveProfile({ avatar_url: url });
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

    if (!handleLocked && nameInput) {
      const h = normaliseHandle(nameInput.value);
      if (h) {
        if (!/^[a-z0-9_]{3,20}$/.test(h)) {
          setStatus("Handle must be 3–20 chars (letters, numbers, underscore).");
          saveBtn.disabled = false;
          return;
        }
        updates.handle = h;
      }
    }

    if (remoteSel) updates.remote_preference = remoteSel.value;
    if (bioInput)  updates.bio = bioInput.value.trim() || null;

    const { error } = await saveProfile(updates);

    if (error) {
      setStatus("Save failed.");
    } else {
      setStatus("Settings saved.");
      if (updates.handle) {
        handleLocked = true;
        nameInput.readOnly = true;
      }
    }

    saveBtn.disabled = false;
  });
}

/* -------------------------------------------------------
   START
-------------------------------------------------------- */
init();