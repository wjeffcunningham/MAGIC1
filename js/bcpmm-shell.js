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

      <!-- AUTH SLOT -->
      <div class="menu-item" id="auth-slot"></div>

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

  /* =====================================================
     AUTH SLOT FILL (READ-ONLY)
  ===================================================== */
  (async () => {
    if (!window.auth) return;

    const slot = document.getElementById("auth-slot");
    if (!slot) return;

    const user = await auth.getUser();

    if (!user) {
      slot.innerHTML = `<a href="/join.html">Sign in / Join</a>`;
    } else {
      slot.innerHTML = `
        <span style="opacity:.7; font-size:0.9em">${user.email}</span><br>
        <a href="#" id="logout-link">Sign out</a>
      `;
      document.getElementById("logout-link").onclick = (e) => {
        e.preventDefault();
        auth.signOut();
      };
    }
  })();
})();