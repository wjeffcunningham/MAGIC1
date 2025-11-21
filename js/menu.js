// menu.js — enhanced interactive dropdown menu

import { supabase } from "./supabase.js";
import { getLocalSession, clearLocalSession } from "./session.js";

const icon = document.getElementById("menu-icon");
const panel = document.getElementById("menu-panel");

//
// SMALL MINIMAL SVG ICONS
//
const icons = {
  matches: `<svg viewBox="0 0 24 24"><path d="M3 5h18v2H3zm0 6h18v2H3zm0 6h18v2H3z"/></svg>`,
  schedule: `<svg viewBox="0 0 24 24"><path d="M7 10h5v5H7zM3 4h18v18H3z" fill="none" stroke="black"/></svg>`,
  standings: `<svg viewBox="0 0 24 24"><path d="M4 18h4v-6H4zm6 0h4V6h-4zm6 0h4v-3h-4z"/></svg>`,
  rankings: `<svg viewBox="0 0 24 24"><path d="M12 3l4 7H8zM5 21h14v-2H5z"/></svg>`,
  profile: `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7z"/></svg>`,
  admin: `<svg viewBox="0 0 24 24"><path d="M12 3l9 6-9 6-9-6zM12 15v6"/></svg>`,
  login: `<svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5v10zM4 4h10v4H4z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24"><path d="M14 7v-3H4v16h10v-3m-5 0l5-5-5-5"/></svg>`,
  bug: `<svg viewBox="0 0 24 24"><path d="M12 3c-1 0-2 1-2 2v2h4V5c0-1-1-2-2-2zM4 11h16m-6 0v8m-4-8v8"/></svg>`
};

//
// highlight active page
//
function isActive(url) {
  return window.location.pathname.includes(url) ? "active" : "";
}

async function buildMenu() {
  const session = getLocalSession();

  // If not logged in
  if (!session) {
    panel.innerHTML = `
      <a class="menu-link" href="/login.html">${icons.login} Login / Create Account</a>
    `;

    icon.addEventListener("click", toggleMenu);
    return;
  }

  // Fetch player row
  const { data: playerRow } = await supabase
    .from("players")
    .select("id, full_name, is_admin")
    .eq("id", session.playerId)
    .maybeSingle();

  const isAdmin = !!playerRow?.is_admin;
  const playerId = playerRow?.id;

  //
  // Build menu HTML
  //
  let html = "";

  // USER LABEL WITH ADMIN BADGE
  html += `
    <div id="menu-user-label">
      ${playerRow.full_name}
      ${isAdmin ? `<span class="admin-badge">Admin</span>` : ""}
    </div>
    <hr style="margin: 12px 0;">
  `;

  //
  // Base items
  //
  html += `
    <a class="menu-link ${isActive("my-matches")}" href="/my-matches.html">${icons.matches} My Matches</a>
    <a class="menu-link ${isActive("report-match")}" href="/report-match.html">${icons.matches} Report Match</a>
    <hr style="margin: 10px 0;">
  `;

  //
  // League items
  //
  html += `
    <div class="menu-group-title">League</div>
    <a class="menu-link ${isActive("/league/index")}" href="/league/index.html">${icons.schedule} League Home</a>
    <a class="menu-link ${isActive("/standings")}" href="/league/standings.html">${icons.standings} Standings</a>
    <a class="menu-link ${isActive("/schedule")}" href="/league/schedule.html">${icons.schedule} Schedule</a>
    <a class="menu-link ${isActive("/rankings")}" href="/league/rankings.html">${icons.rankings} Rankings</a>
  `;

  if (playerId) {
    html += `
      <a class="menu-link ${isActive("player")}" href="/league/player.html?id=${playerId}">
        ${icons.profile} My Profile
      </a>
    `;
  }

  html += `<hr style="margin: 10px 0;">`;

  //
  // Admin block
  //
  if (isAdmin) {
    html += `
      <div class="menu-group-title">Admin</div>
      <a class="menu-link" href="/admin/index.html">${icons.admin} Admin Dashboard</a>
      <a class="menu-link" href="/admin/league.html">${icons.admin} League Admin</a>
      <a class="menu-link" href="/admin/players.html">${icons.admin} Players Admin</a>
      <a class="menu-link" href="/admin/events.html">${icons.admin} Events Admin</a>
      <a class="menu-link" href="/admin/matches.html">${icons.admin} Matches Admin</a>
      <hr style="margin: 10px 0;">
    `;
  }

  //
  // Report a Problem (email or Discord)
  //
  html += `
    <a class="menu-link" href="mailto:wjeffcunningham@gmail.com">${icons.bug} Report a Problem</a>
    <hr style="margin: 10px 0;">
  `;

  //
  // Logout
  //
  html += `<a class="menu-link" id="logout-link" href="#">${icons.logout} Logout</a>`;

  panel.innerHTML = html;

  // Toggle panel animation
  icon.addEventListener("click", toggleMenu);

  // Logout behavior
  document.getElementById("logout-link").addEventListener("click", () => {
    clearLocalSession();
    supabase.auth.signOut();
    window.location.href = "/";
  });
}

//
// Toggle menu with animation
//
function toggleMenu() {
  const open = panel.classList.contains("open");
  if (open) {
    panel.classList.remove("open");
    setTimeout(() => (panel.style.display = "none"), 200);
  } else {
    panel.style.display = "block";
    requestAnimationFrame(() => panel.classList.add("open"));
  }
}

buildMenu();