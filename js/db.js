// /js/db.js
import { supabase } from "./config.js";

/** Single place to change the active league season */
export const CURRENT_SEASON = "BCWL-2026";

/* Fetch full profile for logged-in user */
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("site_users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) return null;
  return data;
}

/* Save profile fields */
export async function saveProfile(updates) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data, error } = await supabase
    .from("site_users")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  return { data, error };
}

/* Upload avatar to Supabase Storage */
export async function uploadAvatar(file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not logged in.") };

  const fileName = `${user.id}.webp`;
  const bucket = supabase.storage.from("profile-images");

  const asWebp = await fileToWebp(file);

  const { error } = await bucket.upload(fileName, asWebp, {
    upsert: true,
    contentType: "image/webp",
  });

  if (error) return { error };

  const { data } = bucket.getPublicUrl(fileName);
  return { url: data.publicUrl };
}

async function fileToWebp(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);

  const blob = await new Promise(resolve =>
    canvas.toBlob(resolve, "image/webp", 0.9)
  );
  return blob;
}

/* Admin actions */
export async function approveUser(id) {
  return await supabase
    .from("site_users")
    .update({ status: "approved" })
    .eq("id", id);
}

export async function rejectUser(id) {
  return await supabase
    .from("site_users")
    .update({ status: "rejected" })
    .eq("id", id);
}

export async function overrideHandle(userId, newHandle) {
  return await supabase
    .from("site_users")
    .update({ moderated_handle: newHandle })
    .eq("id", userId);
}

/** Payment status: stored on site_users for now (“unpaid”, “paid”, “comped”, etc.) */
export async function setPaymentStatus(userId, status) {
  return await supabase
    .from("site_users")
    .update({ payment_status: status })
    .eq("id", userId);
}

export async function removeLeagueMemberRow(rowId) {
  return await supabase
    .from("league_members")
    .delete()
    .eq("id", rowId);
}

/* League membership: season-aware */
export async function joinLeague(season) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not logged in.") };

  return await supabase
    .from("league_members")
    .insert({
      user_id: user.id,
      season,
      payment_status: "unpaid",
    });
}

export async function leaveLeague(season) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not logged in.") };

  return await supabase
    .from("league_members")
    .delete()
    .eq("user_id", user.id)
    .eq("season", season);
}