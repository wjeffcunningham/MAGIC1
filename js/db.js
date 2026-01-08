// /js/db.js
import { supabase } from "./config.js";

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

  // Auto-create profile if missing
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

export async function saveProfile(updates) {
  const user = await getAuthUser();
  if (!user) return { error: new Error("Not logged in") };

  return await supabase
    .from("site_users")
    .update(updates)
    .eq("id", user.id);
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
   LEAGUE
-------------------------------------------------------- */
export async function getMyLeagueMembership(season = "BCWL-2026") {
  const user = await getAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("league_members")
    .select("*")
    .eq("user_id", user.id)
    .eq("season", season)
    .maybeSingle();

  if (error) {
    console.error("getMyLeagueMembership error", error);
    return null;
  }

  return data;
}