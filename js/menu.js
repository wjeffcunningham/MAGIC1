// ===============================
//  MENU.JS (FINAL CLEAN VERSION)
// ===============================

import { supabase } from "./supabase.js";
import { getLocalSession, clearLocalSession, saveLocalSession } from "./session.js";

// DOM reference
const panel = document.getElementById("menu-panel");
const hamburger = document.getElementById("hamburger");

// ---------------------------------------------
// Load Supabase user + player row
// ---------------------------------------------
async function loadUserState() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Logged out
    clearLocalSession();
    return {
      loggedIn: false,
      player: null,
      inLeague: false,
      isAdmin: false,
    };
  }

  // Logged in — load player row
  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("email", user.email)
    .maybeSingle();

  if (!player) {
    // User exists in auth but not in players table
    // Send them to awaiting-approval or profile creation
    return {
      loggedIn: true,
      player: null,
      inLeague: false,
      isAdmin: false,
    };
  }

  // Save locally (for speed / Safari back-forward cache)
  saveLocalSession({
    loggedIn: true,
    playerId: player.id,
    fullName: player.full_name,
    isAdmin: player.is_admin === true,
  });

  // Determine league membership
  const { data: signup } = await supabase
    .from("league_signups")
    .select("status")
    .eq("player_id", player.id)
    .maybeSingle();

  const inLeague = signup?.status === "active";

  return {
    loggedIn: true,
    player,
    inLeague,
    isAdmin: player.is_admin === true,
  };
}

// ---------------------------------------------
// Render the menu based on state
// ---------------------------------------------
async function renderMenu() {
  const state = await loadUserState();
  let html = `<div class="menu-title">Menu</div>`;

  // ---------------------------
  // LOGGED OUT
  // ---------------------------
  if (!state.loggedIn) {
    html += `
      <a href="/login.html" class="menu-link">Log In / Create Account</a>
    `;
    panel.innerHTML = html;
    return;
  }

  // ---------------------------
  // LOGGED IN but NO player row yet
  // (awaiting approval or first-time)
  // ---------------------------
  if (state.loggedIn && !state.player) {
    html += `
      <a href="/" class="menu-link">Home</a>
      <a href="/awaiting-approval.html" class="menu-link">Awaiting Approval</a>
      <hr>
      <a href="#" id="logout-link" class="menu-link">Log Out</a>
    `;
    panel.innerHTML = html;
    attachLogout();
    return;
  }

  // ---------------------------
  // LOGGED IN but NOT IN LEAGUE
  // ---------------------------
  if (!state.inLeague) {
    html += `
      <a href="/" class="menu-link">Home</a>
      <a href="/league/index.html" class="menu-link">League Home</a>
      <a href="/league/signup.html" class="menu-link">Join the League</a>
      <hr>
      <a href="#" id="logout-link" class="menu-link">Log Out</a>
    `;
    panel.innerHTML = html;
    attachLogout();
    return;
  }

  // ---------------------------
  // LOGGED IN + IN LEAGUE
  // ---------------------------
  html += `
    <a href="/" class="menu-link">Home</a>
    <a href="/league/index.html" class="menu-link">League Home</a>
    <a href="/my-matches.html" class="menu-link">My Matches</a>
    <a href="/report-match.html" class="menu-link">Report Match</a>
    <a href="/profile.html" class="menu-link">My Profile</a>
  `;

  // ---------------------------
  // ADMIN BLOCK (Option A — grouped)
  // ---------------------------
  if (state.isAdmin) {
    html += `
      <hr>
      <div class="menu-title">Admin</div>

      <a href="/admin/league.html" class="menu-link">League Admin</a>
      <a href="/admin/pending-players.html" class="menu-link">Approve Players</a>
      <a href="/admin/approve-matches.html" class="menu-link">Approve Matches</a>
      <a href="/admin/players.html" class="menu-link">Player Database</a>
      <a href="/admin/pods.html" class="menu-link">Pods</a>
      <a href="/admin/reshuffle.html" class="menu-link">Reshuffle Tool</a>
      <a href="/admin/standings.html" class="menu-link">Standings (Admin)</a>
      <a href="/admin/generate-tokens.html" class="menu-link">Token Generator</a>
    `;
  }

  html += `
    <hr>
    <a href="#" id="logout-link" class="menu-link">Log Out</a>
  `;

  panel.innerHTML = html;
  attachLogout();
}

// ---------------------------------------------
// LOG OUT
// ---------------------------------------------
function attachLogout() {
  const logout = document.getElementById("logout-link");
  if (!logout) return;

  logout.addEventListener("click", async () => {
    await supabase.auth.signOut();
    clearLocalSession();
    window.location.href = "/login.html";
  });
}

// ---------------------------------------------
// Close menu when clicking outside
// ---------------------------------------------
document.addEventListener("click", (e) => {
  if (
    panel.classList.contains("open") &&
    !panel.contains(e.target) &&
    !hamburger.contains(e.target)
  ) {
    panel.classList.remove("open");
  }
});

// ---------------------------------------------
// Hamburger toggle
// ---------------------------------------------
hamburger.addEventListener("click", () => {
  panel.classList.toggle("open");
});

// ---------------------------------------------
// Safari back/forward fix
// ---------------------------------------------
window.addEventListener("pageshow", () => {
  renderMenu();
});

// Initial render
renderMenu();