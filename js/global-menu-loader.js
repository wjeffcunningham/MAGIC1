// global-menu-loader.js — inject hamburger + empty menu panel, then load menu.js

document.addEventListener("DOMContentLoaded", () => {
  // Create menu icon + panel
  const html = `
    <div id="menu-icon" class="menu-icon">☰</div>
    <div id="menu-panel" class="menu-panel"></div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);

  // Inject CSS for icon + menu panel
  const style = document.createElement("style");
  style.textContent = `
    #menu-icon {
      position: fixed;
      top: 18px;
      right: 18px;
      font-size: 2.2rem;
      font-weight: 700;
      cursor: pointer;
      z-index: 5000;
      user-select: none;
      opacity: 0.9;
    }

    #menu-icon:hover { opacity: 1; }

    .menu-panel {
      position: fixed;
      top: 84px;
      right: 18px;
      width: 260px;
      background: white;
      border: 2px solid black;
      border-radius: 14px;
      padding: 18px;
      box-shadow: 0 6px 16px rgba(0,0,0,0.25);

      display: none;
      opacity: 0;
      transform: translateY(-8px);
      transition: opacity .18s ease, transform .18s ease;

      z-index: 4000;
    }

    .menu-panel.open {
      display: block;
      opacity: 1;
      transform: translateY(0);
    }

    .menu-section-title {
      font-size: 1.15rem;
      font-weight: 700;
      text-align: center;
      margin-bottom: 10px;
    }

    .menu-link {
      display: block;
      font-size: 1.05rem;
      padding: 6px 0;
      color: #000;
      text-decoration: none;
    }
    .menu-link:hover {
      text-decoration: underline;
    }

    hr.menu-divider {
      border: none;
      border-bottom: 1px solid #ddd;
      margin: 14px 0;
    }
  `;
  document.head.appendChild(style);

  // Load menu.js after layout
  requestAnimationFrame(() => {
    setTimeout(() => import("/js/menu.js?v=1"), 0);
  });
});