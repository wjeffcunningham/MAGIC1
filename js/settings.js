// /js/settings.js
import { supabase } from "./config.js";

// DOM elements
const notLogged   = document.getElementById("not-logged");
const settings    = document.getElementById("settings-area");
const emailInput  = document.getElementById("email-input");
const nameInput   = document.getElementById("name-input");
const remoteInput = document.getElementById("remote-input");
const bioInput    = document.getElementById("bio-input");
const imageFile   = document.getElementById("image-file");
const avatarImg   = document.getElementById("avatar-img");
const saveBtn     = document.getElementById("save-btn");
const statusEl    = document.getElementById("status");

// Wait for Supabase to restore the session
async function waitForSupabaseAuth() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) return;

  return new Promise((resolve) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          subscription.unsubscribe();
          resolve();
        }
      }
    );
  });
}

// Upload image to 'profile-images' bucket and return public URL
async function uploadImage(file, userId) {
  if (!file) return null;

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${userId}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("profile-images")
    .upload(path, file, { upsert: true });

  if (uploadErr) {
    console.error("upload error", uploadErr);
    statusEl.textContent = "Image upload failed.";
    return null;
  }

  const { data: urlData } = supabase.storage
    .from("profile-images")
    .getPublicUrl(path);

  return urlData?.publicUrl ?? null;
}

async function init() {
  await waitForSupabaseAuth();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    notLogged.style.display = "block";
    settings.style.display  = "none";
    return;
  }

  notLogged.style.display = "none";
  settings.style.display  = "block";

  // Base email
  emailInput.value = user.email || "";

  // Profile row from public.users
  let profile = null;
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, image, bio")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;
    profile = data || { id: user.id, name: user.email, image: null, bio: "" };
  } catch (err) {
    console.error("getProfile error", err);
    profile = { id: user.id, name: user.email, image: null, bio: "" };
  }

  // Player row just for remote_preference (optional)
  let remotePref = "no_remote";
  try {
    const { data } = await supabase
      .from("players")
      .select("remote_preference")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.remote_preference) {
      remotePref = data.remote_preference;
    }
  } catch (err) {
    console.warn("players remote_preference lookup failed (ok)", err);
  }

  // Map stored remote preference → one of the four UI choices
  if (remotePref === "no_remote") {
    remoteInput.value = "no_remote";
  } else {
    // Any remote-OK bucket maps to "both" by default
    remoteInput.value = "remote_both";
  }

  nameInput.value = profile.name || user.email || "";
  bioInput.value  = profile.bio || "";

  if (profile.image) {
    avatarImg.src = profile.image;
  }

  saveBtn.onclick = async () => {
    statusEl.textContent = "Saving…";

    // Upload new image if chosen
    let imageUrl = profile.image;
    if (imageFile && imageFile.files.length > 0) {
      const uploaded = await uploadImage(imageFile.files[0], profile.id);
      if (uploaded) {
        imageUrl = uploaded;
        avatarImg.src = uploaded;
      }
    }

    const displayName = nameInput.value.trim();
    const bio         = bioInput.value.trim();

    // Map the 4-way UI choice down to the existing DB enum
    const remoteUi   = remoteInput.value;
    const storedRemote =
      remoteUi === "no_remote" ? "no_remote" : "remote_ok";

    // Update public.users
    const { error: userErr } = await supabase
      .from("users")
      .update({
        name: displayName,
        bio,
        image: imageUrl
      })
      .eq("id", profile.id);

    if (userErr) {
      console.error("users update error", userErr);
      statusEl.textContent = "Error saving settings.";
      return;
    }

    // Best-effort: sync players table (if row exists)
    try {
      await supabase
        .from("players")
        .update({
          full_name: displayName,
          remote_preference: storedRemote
        })
        .eq("user_id", profile.id);
    } catch (err) {
      console.warn("players update failed (ok for now)", err);
    }

    statusEl.textContent = "Saved!";
  };
}

init();