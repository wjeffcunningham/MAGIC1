// menu.js — unified menu for magic1.ca
import { supabase } from "./supabase.js";
import { getLocalSession, clearLocalSession } from "./session.js";

const menuIcon = document.getElementById("menu-icon");
const menuPanel = document.getElementById("menu-panel");

// open/close
menuIcon.addEventListener("click", () => {
  menuPanel.classList.toggle("open");
});
document.addEventListener("click", (e) => {
  if (!menuPanel.contains(e.target) && e.target !== menuIcon) {
    menuPanel.classList.remove("open");
  }
});

async function loadMenu() {
  const session = getLocalSession();
  let html = "";

  // ====================================================
  // LOGGED OUT
  // ====================================================
  if (!session) {
    html += `
      <div class="menu-section-title">Account</div>
      <a class="menu-link" href="/login.html">Log In</a>
      <a class="menu-link" href="/signup.html">Sign Up</a>
    `;
    menuPanel.innerHTML = html;
    return;
  }

  // ====================================================
  // LOGGED IN USER
  // ====================================================
  html += `
    <div class="menu-section-title">Account</div>
    <div style="font-weight:700; padding:6px 0;">
      ${session.username || "(no username)"}
    </div>
    <a class="menu-link" href="/profile.html">Public Profile</a>
    <a class="menu-link" href="/my-matches.html">My Matches</a>
    <a class="menu-link" id="logout-link">Log Out</a>
    <hr class="menu-divider" />
  `;

  // ====================================================
  // LEAGUE
  // ====================================================
  html += `
    <div class="menu-section-title">League</div>
    <a class="menu-link" href="/join-league.html">Join Winter League</a>
    <a class="menu-link" href="/standings.html">Standings</a>
    <a class="menu-link" href="/pairings.html">Pairings</a>
    <hr class="menu-divider" />
  `;

  // ====================================================
  // ADMIN
  // ====================================================
  if (session.isAdmin) {
    html += `
      <div class="menu-section-title">Admin</div>
      <a class="menu-link" href="/admin/dashboard.html">Admin Dashboard</a>
    `;
  }

  menuPanel.innerHTML = html;

  // logout handler
  const logout = document.getElementById("logout-link");
  if (logout) {
    logout.addEventListener("click", async () => {
      await supabase.auth.signOut();
      clearLocalSession();
      window.location.href = "/";
    });
  }
}

loadMenu();