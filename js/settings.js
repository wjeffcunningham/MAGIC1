// /js/settings.js
import { getProfile, saveProfile, uploadAvatar } from "./db.js";

/* -------------------------------------------------------
   DOM ELEMENTS
-------------------------------------------------------- */
const notLogged   = document.getElementById("not-logged");
const settings    = document.getElementById("settings-area");

const emailInput  = document.getElementById("email-input");
const nameInput   = document.getElementById("name-input");     // editable handle
const remoteSel   = document.getElementById("remote-input");
const bioInput    = document.getElementById("bio-input");
const avatarImg   = document.getElementById("avatar-img");
const fileInput   = document.getElementById("image-file");
const saveBtn     = document.getElementById("save-btn");
const statusEl    = document.getElementById("status");

// moderated handle display
const displayHandleWrap = document.getElementById("display-handle-wrap");
const displayHandle     = document.getElementById("display-handle");

// generate-random button
const randomHandleBtn = document.getElementById("random-handle-btn");

/* -------------------------------------------------------
   RANDOM HANDLE GENERATOR (short word + 2 digits)
-------------------------------------------------------- */
function generateRandomHandle() {
  const words = [
    "ember","lotus","raven","maple","tidal","otter","cinder",
    "hollow","vivid","brisk","amber","pearl","nexus","poppy",
    "fable","mirth","gleam","swift"
  ];
  const word = words[Math.floor(Math.random() * words.length)];
  const num  = Math.floor(Math.random() * 90 + 10); // 10–99
  return `${word}${num}`; // always ≤ 10 chars
}

/* -------------------------------------------------------
   INITIAL LOAD
-------------------------------------------------------- */
async function init() {
  const profile = await getProfile();
  if (!profile) {
    notLogged.style.display = "block";
    settings.style.display = "none";
    return;
  }

  notLogged.style.display = "none";
  settings.style.display = "block";

  // EMAIL (read-only)
  emailInput.value = profile.email || "";

  // MODERATED HANDLE (admin override)
  if (profile.moderated_handle) {
    displayHandleWrap.style.display = "block";
    displayHandle.textContent = profile.moderated_handle;
  } else {
    displayHandleWrap.style.display = "none";
  }

  // USER HANDLE (editable)
  nameInput.value = profile.handle || "";

  // Remote preference
  remoteSel.value = profile.remote_preference || "no_remote";

  // Bio
  bioInput.value = profile.bio || "";

  // Avatar
  avatarImg.src = profile.image || "/assets/default-avatar.png";
}

/* -------------------------------------------------------
   AVATAR UPLOAD
-------------------------------------------------------- */
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

/* -------------------------------------------------------
   GENERATE RANDOM HANDLE
-------------------------------------------------------- */
randomHandleBtn.onclick = () => {
  nameInput.value = generateRandomHandle();
};

/* -------------------------------------------------------
   SAVE PROFILE
-------------------------------------------------------- */
saveBtn.onclick = async () => {
  statusEl.textContent = "";

  const newHandle = nameInput.value.trim();

  if (newHandle.length > 10) {
    statusEl.textContent = "Handle must be 10 characters or fewer.";
    return;
  }

  const updates = {
    handle: newHandle,
    remote_preference: remoteSel.value,
    bio: bioInput.value.trim(),
  };

  const { error } = await saveProfile(updates);

  statusEl.textContent = error
    ? "Save failed: " + error.message
    : "Settings saved.";
};

init();