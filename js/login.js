// =============================================================
// login.js — unified login handler
// Supports:
//   • Magic link login
//   • Email/password login
//   • Upgrading magic-link accounts to email/password
// =============================================================

import { supabase } from "./supabase.js";
import {
  getLocalSession,
  saveLocalSession,
  clearLocalSession
} from "./session.js";


// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function nextHref() {
  const next = getQueryParam("next");
  return next ? decodeURIComponent(next) : "/";
}

async function sha256(raw) {
  const bytes = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}


// -----------------------------------------------------------
// UI Elements
// -----------------------------------------------------------
const loggedInPanel     = document.getElementById("logged-in-panel");
const sessionNameEl     = document.getElementById("session-name");
const sessionUserEl     = document.getElementById("session-username");
const sessionNextLink   = document.getElementById("session-next-link");

const tokenPanel        = document.getElementById("token-panel");
const tokenForm         = document.getElementById("token-form");
const tokenInput        = document.getElementById("token-input");
const tokenError        = document.getElementById("token-error");

const emailLoginForm    = document.getElementById("email-login-form");
const emailLoginError   = document.getElementById("email-login-error");

const upgradePanel      = document.getElementById("upgrade-panel");
const upgradeForm       = document.getElementById("upgrade-form");
const upgradeSuccess    = document.getElementById("upgrade-success");
const upgradeError      = document.getElementById("upgrade-error");

const logoutBtn         = document.getElementById("logout-btn");


// -----------------------------------------------------------
// MAGIC LOGIN FLOW
// -----------------------------------------------------------
async function loginWithMagic(rawToken) {
  tokenError.classList.add("hidden");

  if (!rawToken || rawToken.trim().length < 12) {
    tokenError.textContent = "Invalid token.";
    tokenError.classList.remove("hidden");
    return;
  }

  const hashed = await sha256(rawToken.trim());

  const { data: tokenRow, error } = await supabase
    .from("player_tokens")
    .select("player_id")
    .eq("token_hash", hashed)
    .single();

  if (error || !tokenRow) {
    tokenError.textContent = "Token not recognized.";
    tokenError.classList.remove("hidden");
    return;
  }

  const { data: player, error: pErr } = await supabase
    .from("players")
    .select("*")
    .eq("id", tokenRow.player_id)
    .single();

  if (pErr || !player) {
    tokenError.textContent = "Player not found.";
    tokenError.classList.remove("hidden");
    return;
  }

  saveLocalSession({
    playerId: player.id,
    fullName: player.full_name,
    username: player.username || "(no username yet)",
    authUserId: player.auth_user_id || null,
  });

  window.location.href = nextHref();
}


// -----------------------------------------------------------
// EMAIL/PASSWORD LOGIN FLOW
// -----------------------------------------------------------
async function loginWithEmail(email, password) {
  emailLoginError.classList.add("hidden");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.user) {
    emailLoginError.textContent = "Invalid email/password.";
    emailLoginError.classList.remove("hidden");
    return;
  }

  const authUserId = data.user.id;

  const { data: player, error: pErr } = await supabase
    .from("players")
    .select("*")
    .eq("auth_user_id", authUserId)
    .single();

  if (pErr || !player) {
    emailLoginError.textContent = "No BCWL player is linked to this email.";
    emailLoginError.classList.remove("hidden");
    return;
  }

  saveLocalSession({
    playerId: player.id,
    fullName: player.full_name,
    username: player.username || "(no username yet)",
    authUserId,
  });

  window.location.href = nextHref();
}


// -----------------------------------------------------------
// UPGRADE: magic → email/password
// -----------------------------------------------------------
async function upgradeAccount(session, email, password) {
  upgradeError.classList.add("hidden");
  upgradeSuccess.classList.add("hidden");

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error || !data.user) {
    upgradeError.textContent = error?.message || "Could not create account.";
    upgradeError.classList.remove("hidden");
    return;
  }

  const authUserId = data.user.id;

  const { error: linkErr } = await supabase
    .from("players")
    .update({ auth_user_id: authUserId })
    .eq("id", session.playerId);

  if (linkErr) {
    upgradeError.textContent = "Could not link account to player.";
    upgradeError.classList.remove("hidden");
    return;
  }

  saveLocalSession({
    playerId: session.playerId,
    fullName: session.fullName,
    username: session.username,
    authUserId,
  });

  upgradeSuccess.textContent = "Email login created successfully.";
  upgradeSuccess.classList.remove("hidden");
}


// -----------------------------------------------------------
// INITIALIZER
// -----------------------------------------------------------
async function init() {
  const session = getLocalSession();

  sessionNextLink.href = nextHref();

  if (session) {
    loggedInPanel.classList.remove("hidden");
    sessionNameEl.textContent = session.fullName;
    sessionUserEl.textContent = session.username;

    if (!session.authUserId) {
      upgradePanel.classList.remove("hidden");
    }
  }

  const urlToken = getQueryParam("token");
  if (urlToken && !session) {
    tokenInput.value = urlToken;
    await loginWithMagic(urlToken);
  }

  tokenForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await loginWithMagic(tokenInput.value);
  });

  emailLoginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(emailLoginForm);
    await loginWithEmail(fd.get("email"), fd.get("password"));
  });

  upgradeForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sess = getLocalSession();
    if (!sess) return;
    const fd = new FormData(upgradeForm);
    await upgradeAccount(sess, fd.get("email"), fd.get("password"));
  });

  logoutBtn?.addEventListener("click", () => {
    clearLocalSession();
    supabase.auth.signOut();
    window.location.href = "/login.html";
  });
}

init();