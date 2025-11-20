import { supabase } from "./supabase.js";
import { getSession, setSession, clearSession } from "./session.js";

// --- helpers ---

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function generateNextHref() {
  const next = getQueryParam("next");
  return next ? decodeURIComponent(next) : "/";
}

async function hashToken(rawToken) {
  const enc = new TextEncoder();
  const data = enc.encode(rawToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// --- UI elements ---
const loggedInPanel = document.getElementById("logged-in-panel");
const sessionNameEl = document.getElementById("session-name");
const sessionUserEl = document.getElementById("session-username");
const sessionNextLink = document.getElementById("session-next-link");
const logoutBtn = document.getElementById("logout-btn");

const tokenPanel = document.getElementById("token-panel");
const tokenForm = document.getElementById("token-form");
const tokenInput = document.getElementById("token-input");
const tokenError = document.getElementById("token-error");

const emailLoginForm = document.getElementById("email-login-form");
const emailLoginError = document.getElementById("email-login-error");

const upgradePanel = document.getElementById("upgrade-panel");
const upgradeForm = document.getElementById("upgrade-form");
const upgradeError = document.getElementById("upgrade-error");
const upgradeSuccess = document.getElementById("upgrade-success");

// --- core flows ---

async function loginWithToken(rawToken) {
  tokenError.classList.add("hidden");
  if (!rawToken || rawToken.trim().length < 10) {
    tokenError.textContent = "Invalid token.";
    tokenError.classList.remove("hidden");
    return;
  }

  const tokenHash = await hashToken(rawToken.trim());

  const { data: tokenRow, error } = await supabase
    .from("player_tokens")
    .select("player_id")
    .eq("token_hash", tokenHash)
    .single();

  if (error || !tokenRow) {
    tokenError.textContent = "Token not recognized.";
    tokenError.classList.remove("hidden");
    return;
  }

  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("id, full_name, username, auth_user_id")
    .eq("id", tokenRow.player_id)
    .single();

  if (playerErr || !player) {
    tokenError.textContent = "Player not found for this token.";
    tokenError.classList.remove("hidden");
    return;
  }

  setSession({
    playerId: player.id,
    username: player.username || "(no username yet)",
    fullName: player.full_name,
    authUserId: player.auth_user_id || null,
  });

  window.location.href = generateNextHref();
}

async function loginWithEmailPassword(email, password) {
  emailLoginError.classList.add("hidden");

  const { data: authData, error: authErr } = await supabase.auth
    .signInWithPassword({ email, password });

  if (authErr || !authData.user) {
    emailLoginError.textContent = "Invalid email or password.";
    emailLoginError.classList.remove("hidden");
    return;
  }

  const authUserId = authData.user.id;

  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("id, full_name, username, auth_user_id")
    .eq("auth_user_id", authUserId)
    .single();

  if (playerErr || !player) {
    emailLoginError.textContent = "No BCWL player is linked to this account yet.";
    emailLoginError.classList.remove("hidden");
    return;
  }

  setSession({
    playerId: player.id,
    username: player.username || "(no username yet)",
    fullName: player.full_name,
    authUserId: player.auth_user_id || null,
  });

  window.location.href = generateNextHref();
}

async function upgradeAccount(session, email, password) {
  upgradeError.classList.add("hidden");
  upgradeSuccess.classList.add("hidden");

  // Sign up in Supabase Auth
  const { data, error: signUpErr } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpErr || !data.user) {
    upgradeError.textContent = "Error creating auth user: " +
      (signUpErr?.message || "unknown error");
    upgradeError.classList.remove("hidden");
    return;
  }

  const authUserId = data.user.id;

  // Link auth_user_id to the existing player
  const { error: updateErr } = await supabase
    .from("players")
    .update({ auth_user_id: authUserId })
    .eq("id", session.playerId);

  if (updateErr) {
    upgradeError.textContent = "Error linking account to player.";
    upgradeError.classList.remove("hidden");
    return;
  }

  // Refresh local session
  setSession({
    playerId: session.playerId,
    username: session.username,
    fullName: session.fullName,
    authUserId,
  });

  upgradeSuccess.textContent = "Email login created and linked successfully.";
  upgradeSuccess.classList.remove("hidden");
}

// --- initialisation ---

async function init() {
  const session = getSession();
  const nextHref = generateNextHref();
  sessionNextLink.href = nextHref;

  if (session) {
    // Show "already logged in"
    loggedInPanel.classList.remove("hidden");
    sessionNameEl.textContent = session.fullName;
    sessionUserEl.textContent = session.username;

    // Show upgrade panel if not yet linked to auth
    if (!session.authUserId) {
      upgradePanel.classList.remove("hidden");
    }
  }

  // Auto-token from URL if present and not already logged in
  const urlToken = getQueryParam("token");
  if (urlToken && !session) {
    tokenInput.value = urlToken;
    await loginWithToken(urlToken);
  }

  // Form handlers
  tokenForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await loginWithToken(tokenInput.value);
  });

  emailLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(emailLoginForm);
    const email = formData.get("email");
    const password = formData.get("password");
    await loginWithEmailPassword(email, password);
  });

  logoutBtn.addEventListener("click", () => {
    clearSession();
    supabase.auth.signOut();
    window.location.href = "/login.html";
  });

  if (upgradeForm) {
    upgradeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sessionNow = getSession();
      if (!sessionNow) {
        upgradeError.textContent = "You are not logged in.";
        upgradeError.classList.remove("hidden");
        return;
      }
      const fd = new FormData(upgradeForm);
      const email = fd.get("email");
      const password = fd.get("password");
      await upgradeAccount(sessionNow, email, password);
    });
  }
}

init();