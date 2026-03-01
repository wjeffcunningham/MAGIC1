/* =====================================================
   db.js — Single Supabase Client (Stable)
===================================================== */

/* -------------------------------------------------------
   Use Global Auth Client
-------------------------------------------------------- */

const supabase = window.auth._client;

/* -------------------------------------------------------
   CONSTANTS
-------------------------------------------------------- */

export const CURRENT_SEASON = "BCWL-2026";

/* -------------------------------------------------------
   AUTH
-------------------------------------------------------- */

export async function getAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

/* -------------------------------------------------------
   PROFILE (site_users)
-------------------------------------------------------- */

export async function getProfile() {
  const user = await getAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("site_users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getProfile error", error);
    return null;
  }

  if (!data) {
    const { data: created, error: createErr } = await supabase
      .from("site_users")
      .insert({
        id: user.id,
        email: user.email,
        status: "active",
        is_mod: false
      })
      .select()
      .single();

    if (createErr) {
      console.error("profile auto-create failed", createErr);
      return null;
    }

    return created;
  }

  return data;
}

export async function ensureProfile() {
  const user = await getAuthUser();
  if (!user) return { error: new Error("Not logged in") };

  const { data, error } = await supabase
    .from("site_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return { error };
  if (data) return { error: null };

  const { error: insertErr } = await supabase
    .from("site_users")
    .insert({
      id: user.id,
      email: user.email,
      status: "active",
      is_mod: false
    });

  return { error: insertErr || null };
}

export async function saveProfile(updates) {
  const user = await getAuthUser();
  if (!user) return { error: new Error("Not logged in") };

  const { error } = await supabase
    .from("site_users")
    .update(updates)
    .eq("id", user.id);

  return { error };
}

/* -------------------------------------------------------
   AVATAR UPLOAD
-------------------------------------------------------- */

export async function uploadAvatar(file) {
  const user = await getAuthUser();
  if (!user) return { error: new Error("Not logged in") };

  const ext = file.name.split(".").pop();
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("profile-images")
    .upload(path, file, { upsert: true });

  if (uploadErr) return { error: uploadErr };

  const { data } = supabase.storage
    .from("profile-images")
    .getPublicUrl(path);

  return { url: data.publicUrl, error: null };
}

/* -------------------------------------------------------
   LEAGUE MEMBERSHIP
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

  return data;
}

export async function joinCurrentLeague() {
  const user = await getAuthUser();
  if (!user) return { error: new Error("Not logged in") };

  const { data: existing, error: checkErr } = await supabase
    .from("league_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("season", CURRENT_SEASON)
    .maybeSingle();

  if (checkErr) return { error: checkErr };
  if (existing) return { error: null, already: true };

  const { error } = await supabase
    .from("league_members")
    .insert({
      user_id: user.id,
      season: CURRENT_SEASON,
      payment_status: "unpaid",
      confirmed: false
    });

  return { error };
}

/* -------------------------------------------------------
   LEAGUE ROSTER
-------------------------------------------------------- */

export async function getLeagueRoster() {
  const { data: members, error } = await supabase
    .from("league_members")
    .select("user_id, payment_status, confirmed, joined_at")
    .eq("season", CURRENT_SEASON)
    .order("joined_at", { ascending: true });

  if (error || !members) {
    console.error("getLeagueRoster error", error);
    return [];
  }

  if (members.length === 0) return [];

  const userIds = members.map(m => m.user_id);

  const { data: users, error: usersErr } = await supabase
    .from("site_users")
    .select("id, email, handle, moderated_handle")
    .in("id", userIds);

  if (usersErr || !users) {
    console.error("getLeagueRoster users error", usersErr);
    return [];
  }

  const byId = Object.fromEntries(users.map(u => [u.id, u]));

  return members.map(m => {
    const u = byId[m.user_id] || {};
    return {
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