// login.js — email login + token login + upgrade path
import { supabase } from "./supabase.js";
import {
  getLocalSession,
  saveLocalSession,
  clearLocalSession,
} from "./session.js";

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function nextHref() {
  const n = getQueryParam("next");
  return n ? decodeURIComponent(n) : "/";
}

async function sha256(raw) {
  const bytes = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// UI refs
const loggedInPanel = document.getElementById("logged-in-panel");
const sessionNameEl = document.getElementById("session-name");
const sessionUserEl = document.getElementById("session-username");
const sessionNextLink = document.getElementById("session-next-link");
const logoutBtn = document.getElementById("logout-btn");

const emailLoginForm = document.getElementById("email-login-form");
const emailLoginError = document.getElementById("email-login-error");

const tokenForm = document.getElementById("token-form");
const tokenInput = document.getElementById("token-input");
const tokenError = document.getElementById("token-error");

// -----------------------------
// MAGIC TOKEN LOGIN
// -----------------------------
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

  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("id", tokenRow.player_id)
    .single();

  saveLocalSession({
    playerId: player.id,
    fullName: player.full_name,
    username: player.username || "(no username yet)",
    authUserId: player.auth_user_id || null,
  });

  if (player.status === "pending") {
    window.location.href = "/awaiting-approval.html";
    return;
  }

  window.location.href = nextHref();
}

// -----------------------------
// EMAIL + PASSWORD LOGIN
// -----------------------------
async function loginWithEmail(email, password) {
  emailLoginError.classList.add("hidden");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    emailLoginError.textContent = "Invalid email or password.";
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
    emailLoginError.textContent = "No BCWL player linked to this login.";
    emailLoginError.classList.remove("hidden");
    return;
  }

  saveLocalSession({
    playerId: player.id,
    fullName: player.full_name,
    username: player.username || "(no username yet)",
    authUserId,
  });

  if (player.status === "pending") {
    window.location.href = "/awaiting-approval.html";
    return;
  }

  window.location.href = nextHref();
}

// -----------------------------
// INIT
// -----------------------------
async function init() {
  const session = getLocalSession();
  sessionNextLink.href = nextHref();

  // If already logged in
  if (session) {
    loggedInPanel.classList.remove("hidden");
    sessionNameEl.textContent = session.fullName;
    sessionUserEl.textContent = session.username;
  }

  // Auto-token if in URL
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

  logoutBtn?.addEventListener("click", () => {
    clearLocalSession();
    supabase.auth.signOut();
    window.location.href = "/login.html";
  });
}

init();