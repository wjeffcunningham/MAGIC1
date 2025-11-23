// menu.js — dynamic menu based on Supabase auth + DB

import { supabase } from "./supabase.js";

const panel = document.getElementById("menu-panel");
const hamburger = document.getElementById("menu-button");

// Close menu when clicking outside
document.addEventListener("click", (e) => {
  if (!panel.contains(e.target) && e.target !== hamburger) {
    panel.classList.remove("open");
  }
});

// Toggle menu
hamburger.addEventListener("click", (e) => {
  e.stopPropagation();
  panel.classList.toggle("open");
});

// -------------------------------------------------------
// HELPER: return logged-in user or null
// -------------------------------------------------------
async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

// -------------------------------------------------------
// HELPER: return player row or null
// -------------------------------------------------------
async function getPlayer(email) {
  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, is_admin")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) return null;
  return data;
}

// -------------------------------------------------------
// HELPER: does player have an ACTIVE league signup?
// -------------------------------------------------------
async function hasActiveLeague(playerId) {
  const { data, error } = await supabase
    .from("league_signups")
    .select("status, signup_date")
    .eq("player_id", playerId)
    .order("signup_date", { ascending: true });

  if (error || !data || data.length === 0) return false;

  const latest = data[data.length - 1];
  return latest.status === "active";
}

// -------------------------------------------------------
// BUILD MENU
// -------------------------------------------------------
async function buildMenu() {
  const user = await getUser();

  // Logged-out
  if (!user) {
    panel.innerHTML = `
      <div class="menu-section-title">Account</div>
      <a href="/login.html" class="menu-link">Login / Create Account</a>
    `;
    return;
  }

  // Logged-in → check player row
  const player = await getPlayer(user.email);
  const isAdmin = !!player?.is_admin;

  let isActiveLeague = false;
  if (player) {
    isActiveLeague = await hasActiveLeague(player.id);
  }

  // -----------------------------------------------------
  // MENU SECTION: Logged-in but not yet in players table
  // -----------------------------------------------------
  if (!player) {
    panel.innerHTML = `
      <div class="menu-section-title">Account</div>
      <a href="/profile.html" class="menu-link">Complete Profile</a>
      <a href="#" id="logout-link" class="menu-link">Logout</a>
    `;
    wireLogout();
    return;
  }

  // -----------------------------------------------------
  // MENU SECTION: logged-in but NOT in league
  // -----------------------------------------------------
  if (!isActiveLeague) {
    panel.innerHTML = `
      <div class="menu-section-title">${player.full_name}</div>

      <a href="/" class="menu-link">Home</a>
      <a href="/league/index.html" class="menu-link">League Home</a>
      <a href="/league/signup.html" class="menu-link">Join the League</a>

      <hr>
      <a href="/profile.html" class="menu-link">My Profile</a>
      <a href="#" id="logout-link" class="menu-link">Logout</a>

      ${isAdmin ? `<hr><a href="/admin/index.html" class="menu-link">Admin Area</a>` : ""}
    `;
    wireLogout();
    return;
  }

  // -----------------------------------------------------
  // MENU SECTION: ACTIVE LEAGUE PLAYER
  // -----------------------------------------------------
  panel.innerHTML = `
    <div class="menu-section-title">${player.full_name}</div>

    <a href="/" class="menu-link">Home</a>
    <a href="/league/index.html" class="menu-link">League Home</a>
    <a href="/my-matches.html" class="menu-link">My Matches</a>
    <a href="/report-match.html" class="menu-link">Report Match</a>
    <a href="/league/standings.html" class="menu-link">Standings</a>
    <a href="/league/schedule.html" class="menu-link">Schedule</a>
    <a href="/league/rankings.html" class="menu-link">Rankings</a>
    <a href="/profile.html" class="menu-link">My Profile</a>

    ${isAdmin
      ? `<hr><a href="/admin/index.html" class="menu-link">Admin Area</a>`
      : ""
    }

    <hr>
    <a href="#" id="logout-link" class="menu-link">Logout</a>
  `;

  wireLogout();
}

// -------------------------------------------------------
// LOGOUT HANDLER
// -------------------------------------------------------
function wireLogout() {
  const btn = document.getElementById("logout-link");
  if (!btn) return;

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    window.location.href = "/";
  });
}

// INIT
buildMenu();