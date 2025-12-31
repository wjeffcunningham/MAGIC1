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

/**
 * Canonical profile loader.
 * GUARANTEE:
 *  - If a user is authenticated, they will have a site_users row.
 *  - Missing rows are created automatically (status = pending).
 */
export async function getProfile() {
  const user = await getAuthUser();
  if (!user) return null;

  const uid = user.id;
  const email = user.email?.toLowerCase() || null;

  // Try fetch
  const { data, error } = await supabase
    .from("site_users")
    .select("*")
    .eq("id", uid)
    .single();

  if (data) return data;

  // If row does not exist → create it (self-healing)
  if (error && error.code === "PGRST116") {
    const { data: inserted, error: insErr } = await supabase
      .from("site_users")
      .insert({
        id: uid,
        email,
        status: "pending",
        is_mod: false
      })
      .select("*")
      .single();

    if (insErr) {
      console.error("getProfile auto-create failed", insErr);
      return null;
    }

    return inserted;
  }

  console.error("getProfile unexpected error", error);
  return null;
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

  const url = urlData?.publicUrl || null;
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

export async function getMyLeagueMembership() {
  const user = await getAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("league_members")
    .select("*")
    .eq("user_id", user.id)
    .eq("season", CURRENT_SEASON)
    .maybeSingle();

  if (error) {
    console.error("getMyLeagueMembership error", error);
    return null;
  }
  return data || null;
}

export async function getLeagueRoster() {
  const { data: members, error } = await supabase
    .from("league_members")
    .select("id, user_id, payment_status, confirmed, joined_at")
    .eq("season", CURRENT_SEASON)
    .order("joined_at", { ascending: true });

  if (error || !members || members.length === 0) return [];

  const userIds = [...new Set(members.map(m => m.user_id))];

  const { data: users, error: usersErr } = await supabase
    .from("site_users")
    .select("id, email, handle, moderated_handle")
    .in("id", userIds);

  if (usersErr || !users) return [];

  const userById = new Map(users.map(u => [u.id, u]));

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

export async function joinCurrentLeague() {
  const user = await getAuthUser();
  if (!user) return { error: new Error("Not logged in") };

  const { data: existing, error: existErr } = await supabase
    .from("league_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("season", CURRENT_SEASON);

  if (existErr) return { error: existErr };
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

  return { data, error, already: false };
}

/* -------------------------------------------------------
   ADMIN HELPERS
-------------------------------------------------------- */
// approveUser / rejectUser / etc live in admin-api.js