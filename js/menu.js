// /js/menu.js
import { supabase } from "./supabase.js";
import { getLocalSession, clearLocalSession } from "./session.js";

const hamburger = document.getElementById("hamburger");
const panel = document.getElementById("menu-panel");

function toggleMenu() {
  panel.classList.toggle("open");
}

hamburger.addEventListener("click", toggleMenu);

// Close when clicking outside panel
document.addEventListener("click", (e) => {
  if (panel.contains(e.target) || hamburger.contains(e.target)) return;
  panel.classList.remove("open");
});

// Build menu
async function buildMenu() {
  const session = getLocalSession();
  let html = "";

  html += `<div class="menu-title">Navigation</div>`;
  html += `<a class="menu-link" href="/">Home</a>`;
  html += `<a class="menu-link" href="/league.html">BC Winter League</a>`;
  html += `<a class="menu-link" href="/events.html">BCPMM Events</a>`;

  html += `<hr/>`;

  if (!session) {
    html += `<div class="menu-title">Account</div>`;
    html += `<a class="menu-link" href="/login.html">Log In</a>`;
    html += `<a class="menu-link" href="/login.html#signup">Sign Up</a>`;
  } else {
    html += `<div class="menu-title">Account</div>`;
    html += `<a class="menu-link" href="/profile.html">${session.fullName}</a>`;
    html += `<a class="menu-link" id="logout-btn" href="#">Log Out</a>`;
  }

  panel.innerHTML = html;

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      clearLocalSession();
      window.location.href = "/";
    });
  }
}

buildMenu();