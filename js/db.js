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

// Save partial profile updates
export async function saveProfile(updates) {
  const user = await getAuthUser();
  if (!user) return { error: new Error("Not logged in") };

  const { data, error } = await supabase
    .from("site_users")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) console.error("saveProfile error", error);
  return { data, error };
}

/* -------------------------------------------------------
   AVATAR UPLOAD (profile-images bucket)
-------------------------------------------------------- */
export async function uploadAvatar(file) {
  const user = await getAuthUser();
  if (!user) return { error: new Error("Not logged in") };
  if (!file) return { error: new Error("No file provided") };

  const ext = file.name && file.name.includes(".")
    ? file.name.split(".").pop()
    : "jpg";

  const filePath = `${user.id}/${Date.now()}.${ext}`;

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
   MAILING LIST (optional table: mailing_list)
-------------------------------------------------------- */
export async function subscribeToMailingList(email) {
  if (!email) return { error: new Error("Email required") };

  const { error } = await supabase
    .from("mailing_list")
    .insert({ email });

  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      // already subscribed, treat as success
      return { error: null };
    }
    console.error("subscribeToMailingList error", error);
    return { error };
  }

  return { error: null };
}

/* -------------------------------------------------------
   LEAGUE HELPERS
-------------------------------------------------------- */

// Get current season membership for logged-in user
export async function getMyLeagueMembership() {
  const user = await getAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("league_members")
    .select("*")
    .eq("user_id", user.id)
    .eq("season", CURRENT_SEASON);

  if (error) {
    console.error("getMyLeagueMembership error", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0];
}

// Get full roster for current season (league_members + site_users)
export async function getLeagueRoster() {
  const { data: members, error } = await supabase
    .from("league_members")
    .select("id, user_id, payment_status, confirmed, joined_at")
    .eq("season", CURRENT_SEASON)
    .order("joined_at", { ascending: true });

  if (error) {
    console.error("getLeagueRoster members error", error);
    return [];
  }
  if (!members || members.length === 0) return [];

  const userIds = [...new Set(members.map(m => m.user_id))];

  const { data: users, error: usersErr } = await supabase
    .from("site_users")
    .select("id, email, handle, moderated_handle")
    .in("id", userIds);

  if (usersErr) {
    console.error("getLeagueRoster users error", usersErr);
    return [];
  }

  const userById = new Map(users.map(u => [u.id, u]));

  // join
  return members.map(m => {
    const u = userById.get(m.user_id) || {};
    return {
      id: m.id,
      user_id: m.user_id,
      email: u.email || "",
      handle: u.handle || "",
      moderated_handle: u.moderated_handle || "",
      payment_status: m.payment_status || "unpaid",
      confirmed: !!m.confirmed,
      joined_at: m.joined_at
    };
  });
}

// Join league for current season (inserts league_members row)
export async function joinCurrentLeague() {
  const user = await getAuthUser();
  if (!user) return { error: new Error("Not logged in") };

  // check if already member
  const { data: existing, error: existErr } = await supabase
    .from("league_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("season", CURRENT_SEASON);

  if (existErr) {
    console.error("joinCurrentLeague check error", existErr);
    return { error: existErr };
  }
  if (existing && existing.length > 0) {
    return { error: null, already: true };
  }

  const { data, error } = await supabase
    .from("league_members")
    .insert({
      user_id: user.id,
      season: CURRENT_SEASON,
      payment_status: "unpaid",
      confirmed: false
    })
    .select()
    .single();

  if (error) {
    console.error("joinCurrentLeague insert error", error);
  }

  return { data, error, already: false };
}

/* -------------------------------------------------------
   ADMIN HELPERS (used by admin-dashboard via admin-api)
-------------------------------------------------------- */

// Note: approveUser / rejectUser / etc are implemented in /js/admin-api.js
// This file focuses on shared auth/profile/league helpers only.