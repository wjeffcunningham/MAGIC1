// /js/settings.js
import { supabase } from "./config.js";
import { saveProfile } from "./db.js";

/* -------------------------------------------------------
   DOM ELEMENTS
-------------------------------------------------------- */
const notLogged   = document.getElementById("not-logged");
const settings   = document.getElementById("settings-area");

const emailInput = document.getElementById("email-input");
const nameInput  = document.getElementById("name-input");
const remoteSel  = document.getElementById("remote-input");
const bioInput   = document.getElementById("bio-input");
const saveBtn    = document.getElementById("save-btn");
const statusEl   = document.getElementById("status");

const displayHandleWrap = document.getElementById("display-handle-wrap");
const displayHandle     = document.getElementById("display-handle");

/* -------------------------------------------------------
   STATE
-------------------------------------------------------- */
let handleLocked = false;

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

  if (!user) {
    notLogged.style.display = "block";
    settings.style.display  = "none";
    setStatus("Please sign in to edit your settings.");
    return;
  }

  notLogged.style.display = "none";
  settings.style.display  = "block";

  // Email always from auth
  emailInput.value = user.email || "";

  setStatus("Loading profile…");

  const { data: profile } = await supabase
    .from("site_users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const p = profile || {};

  const dh = p.moderated_handle || p.handle || "";
  displayHandle.textContent = dh || "(not set)";
  displayHandleWrap.style.display = dh ? "block" : "none";

  handleLocked = !!p.handle;

  if (handleLocked) {
    nameInput.value = p.handle;
    nameInput.readOnly = true;
    nameInput.style.background = "#f0f0f0";
  } else {
    nameInput.value = "";
    nameInput.readOnly = false;
  }

  remoteSel.value = p.remote_preference || "no_remote";
  bioInput.value  = p.bio || "";

  setStatus("");
}

/* -------------------------------------------------------
   SAVE SETTINGS
-------------------------------------------------------- */
saveBtn.addEventListener("click", async () => {
  setStatus("Saving…");
  saveBtn.disabled = true;

  const updates = {};

  if (!handleLocked) {
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

  updates.remote_preference = remoteSel.value;
  updates.bio = bioInput.value.trim() || null;

  const { error } = await saveProfile(updates);

  if (error) {
    setStatus("Save failed.");
  } else {
    setStatus("Settings saved.");
    if (updates.handle) {
      handleLocked = true;
      nameInput.readOnly = true;
      nameInput.style.background = "#f0f0f0";
    }
  }

  saveBtn.disabled = false;
});

/* -------------------------------------------------------
   START
-------------------------------------------------------- */
init();