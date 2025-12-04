import { supabase } from "./config.js";

export async function getProfile() {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;

  const { data, error } = await supabase
    .from("site_users")
    .select("*")
    .eq("id", user.user.id)
    .single();

  return error ? null : data;
}

export async function saveProfile(updates) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "not logged" };

  const { error } = await supabase
    .from("site_users")
    .update(updates)
    .eq("id", user.user.id);

  return { error };
}

export async function uploadAvatar(file) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "not logged" };

  const filePath = `${user.user.id}/${Date.now()}.jpg`;

  const { error: uploadErr } = await supabase.storage
    .from("profile-images")
    .upload(filePath, file);

  if (uploadErr) return { error: uploadErr };

  const { data: urlData } = supabase.storage
    .from("profile-images")
    .getPublicUrl(filePath);

  return { url: urlData.publicUrl };
}