(function () {
  const root = document.getElementById("global-menu-root");
  if (!root) return;

  /* =====================================================
     Inject menu HTML
  ===================================================== */
  root.innerHTML = `
    <div class="menu-button" id="menu-btn">☰</div>
    <div class="menu-overlay" id="menu-overlay"></div>

    <div class="menu-panel" id="menu-panel">
      <div class="menu-header">
        <strong>Menu</strong>
        <span class="menu-close" id="menu-close">✕</span>
      </div>

      <div class="menu-item" id="toggle-theme" title="Toggle light/dark">
        🌙
      </div>
    </div>
  `;

  const btn = document.getElementById("menu-btn");
  const panel = document.getElementById("menu-panel");
  const closeBtn = document.getElementById("menu-close");
  const overlay = document.getElementById("menu-overlay");
  const toggle = document.getElementById("toggle-theme");

  /* =====================================================
     Menu open / close
  ===================================================== */
  btn.onclick = () => {
    panel.classList.add("open");
    overlay.classList.add("active");
  };

  const closeMenu = () => {
    panel.classList.remove("open");
    overlay.classList.remove("active");
  };

  closeBtn.onclick = closeMenu;
  overlay.onclick = closeMenu;

  /* =====================================================
     Theme sync (single source of truth)
  ===================================================== */
  function syncIcon() {
    toggle.textContent =
      document.body.classList.contains("dark") ? "☀️" : "🌙";
  }

  toggle.onclick = () => {
    document.body.classList.toggle("dark");
    localStorage.setItem(
      "bcpmm-theme",
      document.body.classList.contains("dark") ? "dark" : "light"
    );
    syncIcon();
  };

  const saved = localStorage.getItem("bcpmm-theme");
  if (saved === "dark") document.body.classList.add("dark");
  else document.body.classList.remove("dark");

  syncIcon();
})();