// /js/settings.js
import { supabase } from "./config.js";

// DOM elements
const notLogged = document.getElementById("not-logged");
const settings = document.getElementById("settings-area");
const nameInput = document.getElementById("name-input");
const bioInput = document.getElementById("bio-input");

const remoteInput = document.getElementById("remote-input");
const imageFile = document.getElementById("image-file");
const imgPreview = document.getElementById("img-preview");

const saveBtn = document.getElementById("save-btn");
const status = document.getElementById("status");
const emailInput = document.getElementById("email-input");

// SAFE VERSION — do not block, do not wait for events
async function waitForSupabaseAuth() {
  await supabase.auth.getSession();
}

// Fetch current user's profile
async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, email, name, image, bio, remote_preference")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getProfile error", error);
    return null;
  }

  return data;
}

async function uploadImage(file, userId) {
  const ext = file.name.split('.').pop();
  const path = `${userId}.${ext}`;

  const { error } = await supabase.storage
    .from("profile-images")
    .upload(path, file, { upsert: true });

  if (error) {
    console.error(error);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from("profile-images")
    .getPublicUrl(path);

  return urlData.publicUrl;
}

async function init() {
  await waitForSupabaseAuth();

  const profile = await getProfile();
  if (!profile) {
    notLogged.style.display = "block";
    settings.style.display = "none";
    return;
  }

  notLogged.style.display = "none";
  settings.style.display = "block";

  emailInput.value = profile.email;
  nameInput.value = profile.name || profile.email;
  bioInput.value = profile.bio || "";
  remoteInput.value = profile.remote_preference || "no_remote";

  if (profile.image) {
    imgPreview.src = profile.image;
    imgPreview.style.display = "block";
  }

  saveBtn.onclick = async () => {
    status.textContent = "Saving...";

    let imageUrl = profile.image;
    if (imageFile.files.length > 0) {
      imageUrl = await uploadImage(imageFile.files[0], profile.id);
    }

    const updates = {
      name: nameInput.value.trim(),
      bio: bioInput.value.trim(),
      image: imageUrl,
      remote_preference: remoteInput.value
    };

    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", profile.id);

    if (error) {
      status.textContent = "Error saving settings.";
      console.error(error);
      return;
    }

    // Sync to players table
    await supabase
      .from("players")
      .update({
        full_name: nameInput.value.trim(),
        remote_preference: remoteInput.value
      })
      .eq("user_id", profile.id);

    status.textContent = "Saved!";
  };
}

init();