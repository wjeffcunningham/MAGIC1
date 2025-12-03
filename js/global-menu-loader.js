// /js/global-menu-loader.js
import { supabase } from "./config.js";
import { getProfile } from "./db.js";

// Just let Supabase initialize; do NOT block waiting for a session
async function waitForSupabaseAuth() {
  await supabase.auth.getSession();
}

function insertMenu() {
  const html = `
    <div id="menu-icon" style="
      position:fixed;
      top:16px;
      right:16px;
      width:36px;
      height:36px;
      cursor:pointer;
      z-index:5000;
      display:flex;
      align-items:center;
      justify-content:center;
      background:white;
      border:2px solid black;
      border-radius:8px;
    ">
      <div style="
        width:20px;
        height:2px;
        background:black;
        position:relative;
      ">
        <div style="width:20px; height:2px; background:black; position:absolute; top:-6px;"></div>
        <div style="width:20px; height:2px; background:black; position:absolute; top:6px;"></div>
      </div>
    </div>

    <div id="menu-panel" style="
      position:fixed;
      top:70px;
      right:16px;
      width:200px;
      background:white;
      border:2px solid black;
      border-radius:10px;
      padding:12px;
      display:none;
      z-index:5001;
      box-shadow:0 6px 18px rgba(0,0,0,0.18);
      font-family:-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;
    "></div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);
}

function togglePanel() {
  const panel = document.getElementById("menu-panel");
  panel.style.display = panel.style.display === "none" ? "block" : "none";
}

async function renderMenu() {
  const panel = document.getElementById("menu-panel");
  let profile = null;

  try {
    profile = await getProfile();
  } catch (e) {
    console.error("menu getProfile error", e);
  }

// inside renderMenu(), after we successfully have profile

const btn = (label, href) =>
  `<button onclick="location.href='${href}'"
    style="
      width:100%;
      padding:8px 10px;
      margin:4px 0;
      text-align:left;
      border:1px solid black;
      border-radius:6px;
      background:#f5f5f5;
      cursor:pointer;
    ">${label}</button>`;

if (!profile) {
  panel.innerHTML = btn("Login / Sign-up", "/login.html");
  return;
}

// NEW: only show Admin Dashboard for moderators
const adminBtn = profile.is_mod
  ? btn("Admin Dashboard", "/admin-dashboard.html")
  : "";

panel.innerHTML = `
  <div style="padding-bottom:6px; font-weight:600;">
    ${profile.name}
  </div>
  ${btn("User Settings", "/user-settings.html")}
  ${btn("BCWL Hub", "/bcwl-hub.html")}
  ${btn("BCPMM Hub", "/bcpmmsheet.html")}
  ${adminBtn}
  <button id="logout-btn" style="
    width:100%;
    padding:8px 10px;
    margin-top:8px;
    background:black;
    color:white;
    border-radius:6px;
    border:none;
    cursor:pointer;
  ">Logout</button>
`;

  // Logged-out menu
  if (!profile) {
    panel.innerHTML = btn("Login / Sign-up", "/login.html");
    return;
  }

  // Logged-in menu
  panel.innerHTML = `
    <div style="padding-bottom:6px; font-weight:600;">
      ${profile.name}
    </div>
    ${btn("User Settings", "/user-settings.html")}
    ${btn("BCWL Hub", "/bcwl-hub.html")}
    ${btn("BCPMM Hub", "/bcpmmsheet.html")}
    <button id="logout-btn" style="
      width:100%;
      padding:8px 10px;
      margin-top:8px;
      background:black;
      color:white;
      border-radius:6px;
      border:none;
      cursor:pointer;
    ">Logout</button>
  `;

  panel.querySelector("#logout-btn").onclick = async () => {
    await supabase.auth.signOut();
    location.reload();
  };
}

// Run after DOM is ready
document.addEventListener("DOMContentLoaded", async () => {
  insertMenu();
  document.getElementById("menu-icon").onclick = togglePanel;

  await waitForSupabaseAuth();
  renderMenu();
});