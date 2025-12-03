// /js/settings.js
import { supabase } from "./config.js";

const notLogged = document.getElementById("not-logged");
const settings = document.getElementById("settings-area");

const emailInput   = document.getElementById("email-input");
const nameInput    = document.getElementById("name-input");
const imgInput     = document.getElementById("img-input");
const bioInput     = document.getElementById("bio-input");
const remoteInput  = document.getElementById("remote-input");
const imageFile    = document.getElementById("image-file");
const avatarImg    = document.getElementById("avatar-img");

const saveBtn = document.getElementById("save-btn");
const status  = document.getElementById("status");

async function waitForSupabaseAuth() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) return;

  return new Promise((resolve) => {
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          subscription.unsubscribe();
          resolve();
        }
      });
  });
}

async function fetchProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, email, name, image, bio, remote_preference")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("settings fetchProfile error", error);
    return null;
  }

  return {
    id: data.id,
    email: data.email || user.email,
    name: data.name || data.email || user.email,
    image: data.image || null,
    bio: data.bio || "",
    remote_preference: data.remote_preference || "no_remote",
  };
}

async function uploadImage(file, userId) {
  if (!file) return null;

  const ext  = file.name.split(".").pop() || "png";
  const path = `${userId}.${ext}`;

  const { error } = await supabase
    .storage
    .from("profile-images")
    .upload(path, file, { upsert: true });

  if (error) {
    console.error("uploadImage error", error);
    status.textContent = "Image upload failed.";
    return null;
  }

  const { data } = supabase
    .storage
    .from("profile-images")
    .getPublicUrl(path);

  return data.publicUrl;
}

function setAvatar(url) {
  if (url) {
    avatarImg.src = url;
    avatarImg.style.opacity = "1";
  } else {
    avatarImg.removeAttribute("src");
    avatarImg.style.opacity = "0.3";
  }
}

async function init() {
  await waitForSupabaseAuth();
  const profile = await fetchProfile();

  if (!profile) {
    notLogged.style.display = "block";
    settings.style.display  = "none";
    setAvatar(null);
    return;
  }

  notLogged.style.display = "none";
  settings.style.display  = "block";

  emailInput.value  = profile.email;
  nameInput.value   = profile.name;
  imgInput.value    = profile.image || "";
  bioInput.value    = profile.bio;
  remoteInput.value = profile.remote_preference || "no_remote";
  setAvatar(profile.image);

  // live preview when URL changes
  imgInput.addEventListener("input", () => {
    const url = imgInput.value.trim();
    if (url) setAvatar(url);
  });

  saveBtn.onclick = async () => {
    status.textContent = "Saving…";

    let imageUrl = imgInput.value.trim() || profile.image || null;

    if (imageFile.files.length > 0) {
      const uploadedUrl = await uploadImage(imageFile.files[0], profile.id);
      if (uploadedUrl) {
        imageUrl = uploadedUrl;
        imgInput.value = uploadedUrl;
      }
    }

    const updates = {
      name: nameInput.value.trim() || profile.email,
      bio: bioInput.value.trim(),
      image: imageUrl,
      remote_preference: remoteInput.value,
    };

    // Update users table
    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", profile.id);

    if (error) {
      console.error("settings update error", error);
      status.textContent = "Error saving settings.";
      return;
    }

    // Optional: keep players table in sync if it exists
    await supabase
      .from("players")
      .update({
        full_name: updates.name,
        remote_preference: updates.remote_preference,
      })
      .eq("user_id", profile.id);

    setAvatar(imageUrl);
    status.textContent = "Saved!";
  };
}

init();