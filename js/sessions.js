// =========================================================
// session.js — unified auth/session handler for magic1.ca
// Supports:
//   • Magic link login
//   • Supabase email/password login
//   • Persistent local session
//   • Linking auth users → players table
//   • Admin detection
// =========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// -------------------------------------------------------------------
// 1. Create Supabase client
// -------------------------------------------------------------------
export const supabase = createClient(
  "https://YOUR-SUPABASE-PROJECT-URL.supabase.co",   // ← replace
  "YOUR-ANON-PUBLIC-KEY"                            // ← replace
);

// -------------------------------------------------------------------
// 2. Get current local session (magic link OR email-pass)
// -------------------------------------------------------------------
export function getLocalSession() {
  try {
    return JSON.parse(localStorage.getItem("bcwl_session_v1"));
  } catch (e) {
    return null;
  }
}

// -------------------------------------------------------------------
// 3. Save local session
// -------------------------------------------------------------------
export function saveLocalSession(obj) {
  localStorage.setItem("bcwl_session_v1", JSON.stringify(obj));
}

// -------------------------------------------------------------------
// 4. Clear local session
// -------------------------------------------------------------------
export function clearLocalSession() {
  localStorage.removeItem("bcwl_session_v1");
}

// -------------------------------------------------------------------
// 5. Sign up with email/password
// -------------------------------------------------------------------
export async function emailSignUp(email, password, fullName = null) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) return { error };

  const user = data.user;

  // If user never submitted a player row, we do not create it automatically.
  // Admins can link players manually, or we can add a UI later.

  return { user };
}

// -------------------------------------------------------------------
// 6. Login with email/password
// -------------------------------------------------------------------
export async function emailLogin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return { error };

  const { user } = data;

  // Now find player row with matching email
  const { data: players, error: playerErr } = await supabase
    .from("players")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (playerErr) return { error: playerErr };

  if (!players) {
    return {
      error: {
        message: "No matching player found for this email.",
      },
    };
  }

  // Update auth_user_id if not set
  if (!players.auth_user_id) {
    await supabase
      .from("players")
      .update({ auth_user_id: user.id })
      .eq("email", email);
  }

  // Save merged local session
  saveLocalSession({
    playerId: players.id,
    fullName: players.full_name,
    username: players.username || "(no username yet)",
    isAdmin: players.is_admin === true,
    authUserId: user.id,
    expires: Date.now() + 30 * 24 * 3600 * 1000, // 30 days
  });

  return { user };
}

// -------------------------------------------------------------------
// 7. Magic Link Login — consumes token and generates player session
// -------------------------------------------------------------------
export async function magicLogin(token) {
  const { data, error } = await supabase.rpc("consume_login_token", {
    token_input: token,
  });

  if (error) {
    return { error };
  }

  const { player_id } = data;

  // Get player record
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("*")
    .eq("id", player_id)
    .single();

  if (pErr) {
    return { error: pErr };
  }

  // Save session
  saveLocalSession({
    playerId: players.id,
    fullName: players.full_name,
    username: players.username || "(no username yet)",
    isAdmin: players.is_admin === true,
    authUserId: players.auth_user_id || null,
    createdAt: Date.now(),
    expires: Date.now() + 30 * 24 * 3600 * 1000,
  });

  return { player: players };
}

// -------------------------------------------------------------------
// 8. Logout
// -------------------------------------------------------------------
export async function signOut() {
  await supabase.auth.signOut();
  clearLocalSession();
}

// -------------------------------------------------------------------
// 9. Helper: Get full player record for current session
// -------------------------------------------------------------------
export async function getCurrentPlayer() {
  const session = getLocalSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("id", session.playerId)
    .maybeSingle();

  if (error) return null;

  return data;
}

// -------------------------------------------------------------------
// 10. Check admin
// -------------------------------------------------------------------
export async function isAdmin() {
  const session = getLocalSession();
  if (!session) return false;

  // session stores isAdmin flag, but verify fresh from DB too
  const { data, error } = await supabase
    .from("players")
    .select("is_admin")
    .eq("id", session.playerId)
    .maybeSingle();

  if (error) return false;

  return data?.is_admin === true;
}

// -------------------------------------------------------------------
// 11. Check if logged in
// -------------------------------------------------------------------
export function isLoggedIn() {
  const sess = getLocalSession();
  if (!sess) return false;
  if (Date.now() > sess.expires) {
    clearLocalSession();
    return false;
  }
  return true;
}