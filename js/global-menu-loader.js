// /js/global-menu-loader.js
import { supabase } from "./config.js";

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

function togglePanel() {
  const panel = document.getElementById("menu-panel");
  if (!panel) return;
  panel.style.display =
    panel.style.display === "none" || panel.style.display === "" ? "block" : "none";
}

function wireIcon() {
  const icon = document.getElementById("menu-icon");
  if (!icon) return;
  icon.onclick = togglePanel;
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

async function renderMenu() {
  const panel = document.getElementById("menu-panel");
  if (!panel) return;

  const { data } = await supabase.auth.getUser();
  const user = data?.user || null;

  // 🔓 LOGGED OUT (AUTH ONLY)
  if (!user) {
    panel.innerHTML = btn("Login / Sign-Up", "/login.html");
    return;
  }

  // 🔐 LOGGED IN
  const email = user.email || "User";

  panel.innerHTML = `
    <div style="
      padding-bottom:6px;
      font-weight:600;
      border-bottom:1px solid #ddd;
      margin-bottom:6px;
      word-break:break-all;
    ">
      ${email}
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

  const logoutBtn = panel.querySelector("#logout-btn");
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await supabase.auth.signOut();
      location.href = "/";
    };
  }
}

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