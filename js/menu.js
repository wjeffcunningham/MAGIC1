// /js/menu.js
import { supabase } from "./supabase.js";

// DOM elements (may not exist on every page)
function getEls() {
  return {
    panel: document.getElementById("menu-panel"),
    hamburger: document.getElementById("hamburger"),
  };
}

// ---------------------------------------------
// Helpers: Supabase user + player + league state
// ---------------------------------------------
async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

// Auto-create players row on first login
async function ensurePlayer(user) {
  if (!user?.email) return null;

  const email = user.email.toLowerCase();

  // Try to find existing
  let { data: player, error } = await supabase
    .from("players")
    .select("id, full_name, is_admin")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.warn("Error loading player:", error);
    return null;
  }

  // Already exists
  if (player) return player;

  // Auto-create basic player row
  const insertPayload = {
    email,
    full_name: user.user_metadata?.full_name || null,
  };

  const { data: created, error: insertErr } = await supabase
    .from("players")
    .insert(insertPayload)
    .select("id, full_name, is_admin")
    .maybeSingle();

  if (insertErr) {
    console.warn("Error creating player row:", insertErr);
    return null;
  }

  return created;
}

// League state: active vs pending
async function getLeagueState(playerId) {
  const result = { active: false, pending: false };

  if (!playerId) return result;

  const { data, error } = await supabase
    .from("league_signups")
    .select("status, signup_date")
    .eq("player_id", playerId)
    .order("signup_date", { ascending: true });

  if (error || !data || !data.length) return result;

  const latest = data[data.length - 1];

  if (latest.status === "active") {
    result.active = true;
    result.pending = false;
  } else if (latest.status === "waiting_list") {
    // we treat waiting_list as "signed up, mod must validate / slot not active yet"
    result.active = false;
    result.pending = true;
  } else {
    // dropped or anything else → not active / not pending
    result.active = false;
    result.pending = false;
  }

  return result;
}

// ---------------------------------------------
// Render menu based on REAL DB state
// ---------------------------------------------
async function buildMenu() {
  const { panel } = getEls();
  if (!panel) return;

  let html = `<div class="menu-title">Menu</div>`;

  const user = await getUser();

  // Logged out
  if (!user) {
    html += `
      <a href="/login.html" class="menu-link">Log In / Create Account</a>
    `;
    panel.innerHTML = html;
    return;
  }

  // Logged in → ensure player row exists
  const player = await ensurePlayer(user);

  // If player creation failed for some reason
  if (!player) {
    html += `
      <a href="/" class="menu-link">Home</a>
      <a href="/profile.html" class="menu-link">Complete Profile</a>
      <hr>
      <a href="#" id="logout-link" class="menu-link">Log Out</a>
    `;
    panel.innerHTML = html;
    wireLogout();
    return;
  }

  const isAdmin = !!player.is_admin;
  const leagueState = await getLeagueState(player.id);

  // -----------------------------
  // Logged in, NOT in league
  // (no row, or dropped)
  // -----------------------------
  if (!leagueState.active && !leagueState.pending) {
    html += `
      <a href="/" class="menu-link">Home</a>
      <a href="/league/index.html" class="menu-link">League Home</a>
      <a href="/league/signup.html" class="menu-link">Join the League</a>
      <hr>
      <a href="/profile.html" class="menu-link">My Profile</a>
    `;

    if (isAdmin) {
      html += `
        <hr>
        <a href="/admin/index.html" class="menu-link">Admin Area</a>
      `;
    }

    html += `
      <hr>
      <a href="#" id="logout-link" class="menu-link">Log Out</a>
    `;

    panel.innerHTML = html;
    wireLogout();
    return;
  }

  // -----------------------------
  // Logged in, league signup PENDING MOD VALIDATION
  // (waiting_list)
  // -----------------------------
  if (leagueState.pending && !leagueState.active) {
    html += `
      <a href="/" class="menu-link">Home</a>
      <a href="/league/index.html" class="menu-link">League Home</a>
      <div class="menu-link" style="opacity:0.7; cursor:default;">
        League signup pending approval
      </div>
      <hr>
      <a href="/profile.html" class="menu-link">My Profile</a>
    `;

    if (isAdmin) {
      html += `
        <hr>
        <a href="/admin/index.html" class="menu-link">Admin Area</a>
      `;
    }

    html += `
      <hr>
      <a href="#" id="logout-link" class="menu-link">Log Out</a>
    `;

    panel.innerHTML = html;
    wireLogout();
    return;
  }

  // -----------------------------
  // Logged in, ACTIVE in league
  // -----------------------------
  html += `
    <a href="/" class="menu-link">Home</a>
    <a href="/league/index.html" class="menu-link">League Home</a>
    <a href="/my-matches.html" class="menu-link">My Matches</a>
    <a href="/report-match.html" class="menu-link">Report Match</a>
    <a href="/profile.html" class="menu-link">My Profile</a>
  `;

  if (isAdmin) {
    html += `
      <hr>
      <a href="/admin/index.html" class="menu-link">Admin Area</a>
    `;
  }

  html += `
    <hr>
    <a href="#" id="logout-link" class="menu-link">Log Out</a>
  `;

  panel.innerHTML = html;
  wireLogout();
}

// ---------------------------------------------
// Logout wiring
// ---------------------------------------------
function wireLogout() {
  const { panel } = getEls();
  if (!panel) return;

  const logout = panel.querySelector("#logout-link");
  if (!logout) return;

  logout.addEventListener("click", async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    // session cleared; redirect home
    window.location.href = "/";
  });
}

// ---------------------------------------------
// Init: hook hamburger + outside click + auth changes
// ---------------------------------------------
function initMenu() {
  const { panel, hamburger } = getEls();
  if (!panel || !hamburger) return;

  // Toggle panel on hamburger click
  hamburger.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("open");
  });

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (!panel.classList.contains("open")) return;
    if (!panel.contains(e.target) && e.target !== hamburger) {
      panel.classList.remove("open");
    }
  });

  // Build once on load
  buildMenu();

  // Rebuild on auth changes (login/logout/session refresh)
  supabase.auth.onAuthStateChange((_event, _session) => {
    buildMenu();
  });

  // Safari back/forward cache
  window.addEventListener("pageshow", () => {
    buildMenu();
  });
}

// Run after DOM is ready
document.addEventListener("DOMContentLoaded", initMenu);