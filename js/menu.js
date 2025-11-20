import { getSession, clearSession } from "./session.js";
import { supabase } from "./supabase.js";

const icon = document.getElementById("menu-icon");
const panel = document.getElementById("menu-panel");

async function buildMenu() {
  const session = getSession();

  if (!session) {
    // Before login — icon is normal
    icon.addEventListener("click", () => {
      window.location.href = "/login.html";
    });
    return;
  }

  // Logged in → load admin status
  const { data: user, error } = await supabase
    .from("players")
    .select("is_admin")
    .eq("id", session.playerId)
    .single();

  const isAdmin = !!(user && user.is_admin);

  // Menu HTML
  let html = `
    <a class="menu-link" href="/my-matches.html">My Matches</a>
    <a class="menu-link" href="/report-match.html">Report Match</a>
    <a class="menu-link" href="/standings.html">Standings</a>
    <a class="menu-link" href="/login.html">Profile / Login</a>
    <hr style="margin: 10px 0;">
  `;

  if (isAdmin) {
    html += `
      <a class="menu-link" href="/admin/approve-matches.html">Approve Matches</a>
      <a class="menu-link" href="/admin/generate-tokens.html">Generate Tokens</a>
      <a class="menu-link" href="/admin/index.html">Admin Dashboard</a>
      <hr style="margin: 10px 0;">
    `;
  }

  html += `
    <a class="menu-link" id="logout-link" href="#">Logout</a>
  `;

  panel.innerHTML = html;

  // Toggle dropdown
  icon.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  // Logout handler
  document.getElementById("logout-link").addEventListener("click", () => {
    clearSession();
    supabase.auth.signOut();
    window.location.href = "/";
  });
}

buildMenu();