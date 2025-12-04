// /js/global-menu-loader.js
import { supabase } from "./config.js";
import { getProfile } from "./db.js";

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
        <div style="
          width:20px; height:2px; background:black;
          position:absolute; top:-6px; left:0;"></div>
        <div style="
          width:20px; height:2px; background:black;
          position:absolute; top:6px; left:0;"></div>
      </div>
    </div>

    <div id="menu-panel" style="
      position:fixed;
      top:70px;
      right:16px;
      width:220px;
      background:white;
      border:2px solid black;
      border-radius:10px;
      padding:12px;
      display:none;
      z-index:5001;
      box-shadow:0 6px 18px rgba(0,0,0,0.18);
      font-family:-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;
      font-size:14px;
    "></div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);
}

function togglePanel() {
  const panel = document.getElementById("menu-panel");
  if (!panel) return;
  panel.style.display = panel.style.display === "none" || panel.style.display === "" ? "block" : "none";
}

async function renderMenu() {
  const panel = document.getElementById("menu-panel");
  if (!panel) return;

  let profile = null;
  try {
    profile = await getProfile();
  } catch (err) {
    console.error("menu getProfile error", err);
  }

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

  // Logged OUT
  if (!profile) {
    panel.innerHTML = btn("Login / Sign-Up", "/login.html");
    return;
  }

  // Build menu for logged-in user
  const name = profile.handle || profile.email || "Player";

  const links = [
    btn("User Settings", "/user-settings.html"),
    btn("BCWL Hub", "/bcwl-hub.html"),
    btn("BCPMM Hub", "/bcpmmsheet.html"),
  ];

  // Admin link only if is_mod
  if (profile.is_mod) {
    links.push(btn("Admin Dashboard", "/admin-dashboard.html"));
  }

  panel.innerHTML = `
    <div style="padding-bottom:6px; font-weight:600; border-bottom:1px solid #ddd; margin-bottom:6px;">
      ${name}
    </div>
    ${links.join("")}
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

  const logoutBtn = panel.querySelector("#logout-btn");
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await supabase.auth.signOut();
      location.href = "/"; // hard refresh to clear UI state
    };
  }
}

// Inject menu and wire up once DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  insertMenu();
  const icon = document.getElementById("menu-icon");
  if (icon) icon.onclick = togglePanel;
  renderMenu();
});