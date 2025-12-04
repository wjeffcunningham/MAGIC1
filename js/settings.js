// /js/settings.js
import { getProfile, saveProfile, uploadAvatar } from "./db.js";

const notLogged   = document.getElementById("not-logged");
const settings    = document.getElementById("settings-area");

const emailInput  = document.getElementById("email-input");
const nameInput   = document.getElementById("name-input");  // user handle
const remoteSel   = document.getElementById("remote-input");
const bioInput    = document.getElementById("bio-input");
const avatarImg   = document.getElementById("avatar-img");
const fileInput   = document.getElementById("image-file");
const saveBtn     = document.getElementById("save-btn");
const statusEl    = document.getElementById("status");

// NEW — moderated handle display elements
const displayHandleWrap = document.getElementById("display-handle-wrap");
const displayHandle     = document.getElementById("display-handle");

async function init() {
  const profile = await getProfile();
  if (!profile) {
    notLogged.style.display = "block";
    settings.style.display = "none";
    return;
  }

  notLogged.style.display = "none";
  settings.style.display = "block";

  // ---------- Email (locked)
  emailInput.value = profile.email || "";

  // ---------- Moderated handle (admin override)
  if (profile.moderated_handle) {
    displayHandleWrap.style.display = "block";
    displayHandle.textContent = profile.moderated_handle;

    // User handle still editable (required by you)
    nameInput.placeholder = profile.handle || "";
    nameInput.value = profile.handle || "";
  } else {
    displayHandleWrap.style.display = "none";

    nameInput.value = profile.handle || "";
  }

  // ---------- Remote preference
  remoteSel.value = profile.remote_preference || "no_remote";

  // ---------- Bio
  bioInput.value = profile.bio || "";

  // ---------- Image
  avatarImg.src = profile.image || "/assets/default-avatar.png";
}

// ---------- Avatar upload
fileInput.onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;

  statusEl.textContent = "Uploading image…";

  const { url, error } = await uploadAvatar(file);
  if (error) {
    statusEl.textContent = "Upload failed: " + error.message;
    return;
  }

  await saveProfile({ image: url });
  avatarImg.src = url;
  statusEl.textContent = "Image updated.";
};

// ---------- Save profile
saveBtn.onclick = async () => {
  statusEl.textContent = "";

  const updates = {
    handle: nameInput.value.trim(),
    remote_preference: remoteSel.value,
    bio: bioInput.value.trim(),
  };

  const { error } = await saveProfile(updates);

  statusEl.textContent = error
    ? "Save failed: " + error.message
    : "Settings saved.";
};

init();