// =============================================================
// menu.js — global dropdown menu loader
// Shows menu links based on login state + admin privilege
// =============================================================

import {
  getLocalSession,
  clearLocalSession
} from "./session.js";

import { supabase } from "./supabase.js";

const icon  = document.getElementById("menu-icon");
const panel = document.getElementById("menu-panel");


// -----------------------------------------------------------
// Build Menu
// -----------------------------------------------------------
async function buildMenu() {
  const session = getLocalSession();

  // ======================
  // Not logged in → icon opens login page
  // ======================
  if (!session) {
    icon.addEventListener("click", () => {
      window.location.href = "/login.html";
    });
    return;
  }

  // ======================
  // Fetch admin status
  // ======================
  const { data: row } = await supabase
    .from("players")
    .select("is_admin")
    .eq("id", session.playerId)
    .single();

  const isAdmin = !!row?.is_admin;

  // ======================
  // Build menu contents
  // ======================
  let html = `
    <a class="menu-link" href="/my-matches.html">My Matches</a>
    <a class="menu-link" href="/report-match.html">Report Match</a>
    <a class="menu-link" href="/standings.html">Standings</a>
    <a class="menu-link" href="/login.html">Profile / Login</a>
    <hr style="margin: 10px 0">
  `;

  if (isAdmin) {
    html += `
      <a class="menu-link" href="/admin/approve-matches.html">Approve Matches</a>
      <a class="menu-link" href="/admin/generate-tokens.html">Generate Tokens</a>
      <a class="menu-link" href="/admin/index.html">Admin Dashboard</a>
      <hr style="margin: 10px 0">
    `;
  }

  html += `
    <a class="menu-link" id="logout-link" href="#">Logout</a>
  `;

  panel.innerHTML = html;

  // Panel toggle
  icon.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  // Logout
  const logoutEl = document.getElementById("logout-link");
  logoutEl.addEventListener("click", async () => {
    clearLocalSession();
    await supabase.auth.signOut();
    window.location.href = "/";
  });
}

buildMenu();