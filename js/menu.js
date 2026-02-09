import { initTheme } from "./theme.js";

export function loadGlobalMenu() {
  const root = document.getElementById("global-menu-root");
  if (!root) return;

  root.innerHTML = `
    <div class="menu-button" id="menu-btn">☰</div>
    <div class="menu-overlay" id="menu-overlay"></div>

    <div class="menu-panel" id="menu-panel">
      <div class="menu-header">
        <strong>Menu</strong>
        <span class="menu-close" id="menu-close">✕</span>
      </div>

      <div class="menu-item" id="toggle-theme">🌙</div>
    </div>
  `;

  const btn = document.getElementById("menu-btn");
  const panel = document.getElementById("menu-panel");
  const close = document.getElementById("menu-close");
  const overlay = document.getElementById("menu-overlay");
  const toggle = document.getElementById("toggle-theme");

  btn.onclick = () => {
    panel.classList.add("open");
    overlay.classList.add("active");
  };

  close.onclick = overlay.onclick = () => {
    panel.classList.remove("open");
    overlay.classList.remove("active");
  };

  initTheme(toggle);
}