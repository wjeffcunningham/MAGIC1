// /js/global-menu-loader.js
import { supabase } from "./config.js";
import { getProfile } from "./db.js";

/* -------------------------------------------------------
   INSERT MENU SHELL
-------------------------------------------------------- */
function insertMenu() {
  if (document.getElementById("menu-icon") || document.getElementById("menu-panel")) {
    return;
  }

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
      <div style="width:20px;height:2px;background:black;position:relative;">
        <div style="width:20px;height:2px;background:black;position:absolute;top:-6px;"></div>
        <div style="width:20px;height:2px;background:black;position:absolute;top:6px;"></div>
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

/* -------------------------------------------------------
   UI HELPERS
-------------------------------------------------------- */
function togglePanel() {
  const panel = document.getElementById("menu-panel");
  if (!panel) return;
  panel.style.display =
    panel.style.display === "none" || panel.style.display === "" ? "block" : "none";
}

function wireIcon() {
  const icon = document.getElementById("menu-icon");
  if (icon) icon.onclick = togglePanel;
}

const btn = (label, href) => `
  <button onclick="location.href='${href}'"
    style="
      width:100%;
      padding:8px 10px;
      margin:4px 0;
      text-align:left;
      border:1px solid black;
      border-radius:6px;
      background:#f5f5f5;
      cursor:pointer;
    ">${label}</button>
`;

/* -------------------------------------------------------
   RENDER MENU (AUTH + PROFILE SAFE)
-------------------------------------------------------- */
async function renderMenu() {
  const panel = document.getElementById("menu-panel");
  if (!panel) return;

  let user = null;
  let profile = null;

  try {
    // Always resolve auth first
    const { data: auth } = await supabase.auth.getUser();
    user = auth?.user || null;

    if (user) {
      // Always fetch fresh profile (no caching)
      profile = await getProfile();
    }
  } catch (err) {
    console.error("menu auth/profile error", err);
  }

  /* ---------- LOGGED OUT ---------- */
  if (!user) {
    panel.innerHTML = btn("Login / Sign-Up", "/login.html");
    return;
  }

  /* ---------- LOGGED IN ---------- */
  const displayName =
    profile?.moderated_handle ||
    profile?.handle ||
    user.email ||
    "User";

  let links = `
    <div style="
      padding-bottom:6px;
      font-weight:600;
      border-bottom:1px solid #ddd;
      margin-bottom:6px;
      word-break:break-all;
    ">${displayName}</div>

    ${btn("User Settings", "/user-settings.html")}
    ${btn("BCWL Hub", "/bcwl-hub.html")}
    ${btn("BCPMM Hub", "/bcpmmsheet.html")}
  `;

  // 🔑 ADMIN LINK (LIVE)
  if (profile?.is_mod === true) {
    links += btn("Admin Dashboard", "/admin-dashboard.html");
  }

  panel.innerHTML = `
    ${links}
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
      location.href = "/";
    };
  }
}

/* -------------------------------------------------------
   INIT
-------------------------------------------------------- */
function initMenu() {
  insertMenu();
  wireIcon();
  renderMenu();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMenu);
} else {
  initMenu();
}