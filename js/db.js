// /js/db.js
import { supabase } from "./config.js";

// Current active league season identifier
export const CURRENT_SEASON = "BCWL-2026";

/* -------------------------------------------------------
   AUTH HELPERS
-------------------------------------------------------- */
export async function getAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data || !data.user) return null;
  return data.user;
}

/* -------------------------------------------------------
   PROFILE HELPERS (site_users)
-------------------------------------------------------- */
export async function getProfile() {
  const user = await getAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("site_users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("getProfile error", error);
    return null;
  }
  return data;
}

// updates: partial object for site_users, e.g. { handle, bio, remote_preference }
export async function saveProfile(updates) {
  const user = await getAuthUser();
  if (!user) {
    return { error: new Error("Not logged in") };
  }

  const { data, error } = await supabase
    .from("site_users")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    console.error("saveProfile error", error);
  }

  return { data, error };
}

/* -------------------------------------------------------
   AVATAR UPLOAD (profile-images bucket)
-------------------------------------------------------- */
export async function uploadAvatar(file) {
  const user = await getAuthUser();
  if (!user) return { error: new Error("Not logged in") };
  if (!file) return { error: new Error("No file provided") };

  const fileExt = file.name && file.name.includes(".")
    ? file.name.split(".").pop()
    : "jpg";

  const filePath = `${user.id}/${Date.now()}.${fileExt}`;

  const { error: uploadErr } = await supabase.storage
    .from("profile-images")
    .upload(filePath, file, { upsert: true });

  if (uploadErr) {
    console.error("uploadAvatar upload error", uploadErr);
    return { error: uploadErr };
  }

  const { data: urlData } = supabase.storage
    .from("profile-images")
    .getPublicUrl(filePath);

  const url = urlData && urlData.publicUrl ? urlData.publicUrl : null;

  return { url, error: null };
}

/* -------------------------------------------------------
   MAILING LIST
   (Optional table: mailing_list(email text primary key, created_at timestamptz))
-------------------------------------------------------- */
export async function subscribeToMailingList(email) {
  if (!email) return { error: new Error("Email required") };

  try {
    const { error } = await supabase
      .from("mailing_list")
      .insert({ email });

    // Ignore duplicate / unique errors silently – user is already on list
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return { error: null };
      }
      console.error("subscribeToMailingList error", error);
      return { error };
    }

    return { error: null };
  } catch (e) {
    console.error("subscribeToMailingList unexpected error", e);
    return { error: e };
  }
}