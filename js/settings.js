// /js/settings.js
import { supabase } from "./config.js";

// DOM elements
const notLogged = document.getElementById("not-logged");
const settings = document.getElementById("settings-area");
const nameInput = document.getElementById("name-input");
const imgInput = document.getElementById("img-input");
const bioInput = document.getElementById("bio-input");
const saveBtn = document.getElementById("save-btn");
const status = document.getElementById("status");
const emailInput = document.getElementById("email-input");

// Wait for Supabase to restore the session
async function waitForSupabaseAuth() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) return;
  return new Promise((resolve) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        subscription.unsubscribe();
        resolve();
      }
    });
  });
}

// Fetch current user's profile with allowed columns
async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  try {
    const { data } = await supabase
      .from("users")
      .select("id, name, is_mod, verified, image, bio")
      .eq("id", user.id)
      .maybeSingle();
    return data ?? null;
  } catch (err) {
    console.error("getProfile error", err);
    return { id: user.id, name: user.email, is_mod: false, verified: false };
  }
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
emailInput.value = profile.email || "";
nameInput.value = profile.name || profile.email || "";
imgInput.value = profile.image || "";
bioInput.value = profile.bio || "";
  saveBtn.onclick = async () => {
    status.textContent = "Saving...";
    const { error } = await supabase
      .from("users")
      .update({
        name: nameInput.value.trim(),
        image: imgInput.value.trim(),
        bio: bioInput.value.trim(),
      })
      .eq("id", profile.id);
    status.textContent = error ? error.message : "Saved!";
  };
}

init();