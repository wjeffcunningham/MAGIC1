import { getLocalSession, clearLocalSession } from "./session.js";
import { supabase } from "./supabase.js";

const icon = document.getElementById("menu-icon");
const panel = document.getElementById("menu-panel");

async function buildMenu() {
  const session = getLocalSession();

  // Not logged in → clicking icon goes to login
  if (!session) {
    icon.onclick = () => (window.location.href = "/login.html");
    return;
  }

  // Logged-in → check admin
  const { data } = await supabase
    .from("players")
    .select("is_admin")
    .eq("id", session.playerId)
    .single();

  const isAdmin = data?.is_admin === true;

  // Build menu
  let html = `
    <a class="menu-link" href="/my-matches.html">My Matches</a><br>
    <a class="menu-link" href="/report-match.html">Report Match</a><br>
    <a class="menu-link" href="/standings.html">Standings</a><br>
    <a class="menu-link" href="/profile.html">Profile</a><br>
    <hr>
  `;

  if (isAdmin) {
    html += `
      <a class="menu-link" href="/admin/approve-matches.html">Approve Matches</a><br>
      <a class="menu-link" href="/admin/pending-players.html">Pending Players</a><br>
      <a class="menu-link" href="/admin/generate-tokens.html">Generate Tokens</a><br>
      <hr>
    `;
  }

  html += `<a id="logout-link" class="menu-link" href="#">Logout</a>`;

  panel.innerHTML = html;

  // Toggle menu display
  icon.onclick = () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  };

  // Logout
  document.getElementById("logout-link").onclick = () => {
    clearLocalSession();
    supabase.auth.signOut();
    window.location.href = "/";
  };
}

buildMenu();