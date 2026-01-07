// /js/db.js
import { supabase } from "./config.js";

// =======================================================
// CONFIG
// =======================================================

export const CURRENT_SEASON = "BCWL-2026";

// =======================================================
// AUTH HELPERS
// =======================================================

export async function getAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

// =======================================================
// PROFILE HELPERS (site_users)
// =======================================================

/**
 * Canonical profile loader.
 * GUARANTEE:
 * - If user is authenticated, they will have a site_users row.
 * - Row is auto-created if missing.
 * - NO approval gating.
 */
export async function getProfile() {
  const user = await getAuthUser();
  if (!user) return null;

  const uid = user.id;
  const email = (user.email || "").trim().toLowerCase();

  const { data, error } = await supabase
    .from("site_users")
    .select("*")
    .eq("id", uid)
    .maybeSingle();

  if (error) {
    console.error("getProfile select error", error);
    return null;
  }

  if (data) return data;

  // Auto-create minimal profile
  const { data: inserted, error: insErr } = await supabase
    .from("site_users")
    .insert({
      id: uid,
      email,
      status: "active",          // informational only
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

// =======================================================
// LEAGUE HELPERS
// =======================================================

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

// =======================================================
// OPTIONAL: MAILING LIST
// =======================================================

export async function subscribeToMailingList(email) {
  if (!email) return { error: new Error("Email required") };

  const { error } = await supabase
    .from("mailing_list")
    .upsert({ email }, { onConflict: "email" });

  return { error: error || null };
}