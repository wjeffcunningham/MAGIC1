// menu.js — builds dropdown menu based on login + admin status

import { supabase } from "./supabase.js";
import { getLocalSession, clearLocalSession } from "./session.js";

const icon = document.getElementById("menu-icon");
const panel = document.getElementById("menu-panel");

async function buildMenu() {
  const session = getLocalSession();

  // If NOT LOGGED IN → menu just links to login page
  if (!session) {
    panel.innerHTML = `
      <a class="menu-link" href="/login.html">Login / Create Account</a>
    `;

    icon.addEventListener("click", () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    });
    return;
  }

  // Logged in → check admin
  const { data: user } = await supabase
    .from("players")
    .select("is_admin")
    .eq("id", session.playerId)
    .single();

  const isAdmin = !!user?.is_admin;

  // Core menu for *all logged in players*
  let html = `
    <a class="menu-link" href="/my-matches.html">My Matches</a>
    <a class="menu-link" href="/report-match.html">Report Match</a>
    <a class="menu-link" href="/pods.html">Pods</a>
    <a class="menu-link" href="/standings.html">Standings</a>
    <a class="menu-link" href="/login.html">Profile / Account</a>
    <hr style="margin: 10px 0;">
  `;

  // Admin menu additions
  if (isAdmin) {
    html += `
      <a class="menu-link" href="/admin/approve-matches.html">Approve Matches</a>
      <a class="menu-link" href="/admin/index.html">Admin Dashboard</a>
      <hr style="margin: 10px 0;">
    `;
  }

  html += `<a class="menu-link" id="logout-link" href="#">Logout</a>`;

  panel.innerHTML = html;

  // Show/hide menu panel
  icon.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  // Logout
  document.getElementById("logout-link").addEventListener("click", () => {
    clearLocalSession();
    supabase.auth.signOut();
    window.location.href = "/";
  });
}

buildMenu();