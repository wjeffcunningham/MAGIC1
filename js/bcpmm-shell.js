/* =====================================================
   BCPMM Global Shell Menu — Production Stable
===================================================== */

(function () {

  document.addEventListener("DOMContentLoaded", initMenu);

  async function initMenu() {

    const root = document.getElementById("global-menu-root");
    if (!root) return;

    /* =====================================================
       Base UI
    ===================================================== */

    root.innerHTML = `
      <div class="menu-button" id="menu-btn">☰</div>
      <div class="menu-overlay" id="menu-overlay"></div>

      <div class="menu-panel" id="menu-panel">
        <div class="menu-header">
          <strong>Menu</strong>
          <span class="menu-close" id="menu-close">✕</span>
        </div>

        <div class="menu-item" id="auth-slot">
          <span style="opacity:.6;">Loading…</span>
        </div>

        <div class="menu-item" id="toggle-theme" title="Toggle light/dark">🌙</div>
      </div>
    `;

    const btn = document.getElementById("menu-btn");
    const panel = document.getElementById("menu-panel");
    const closeBtn = document.getElementById("menu-close");
    const overlay = document.getElementById("menu-overlay");
    const toggle = document.getElementById("toggle-theme");
    const slot = document.getElementById("auth-slot");

    /* =====================================================
       Menu Toggle
    ===================================================== */

    btn.onclick = () => {
      panel.classList.add("open");
      overlay.classList.add("active");
    };

    function closeMenu() {
      panel.classList.remove("open");
      overlay.classList.remove("active");
    }

    closeBtn.onclick = closeMenu;
    overlay.onclick = closeMenu;

    /* =====================================================
       Theme
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

    if (localStorage.getItem("bcpmm-theme") === "dark") {
      document.body.classList.add("dark");
    }

    syncIcon();

    /* =====================================================
       AUTH
    ===================================================== */

    const HOME_LINK_HTML = `<a href="https://magic1.ca" id="menu-home-link">Home</a><br>`;

    // Not authenticated system at all
    if (!window.auth || !window.auth._client) {
      slot.innerHTML = `
        <a href="/join.html">Sign in / Join</a><br>
        ${HOME_LINK_HTML}
      `;
      attachHomeHandler(closeMenu);
      return;
    }

    const supabase = window.auth._client;

    let user = null;

    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user || null;
    } catch (err) {
      console.warn("getUser failed:", err);
    }

    // Logged out state
    if (!user) {
      slot.innerHTML = `
        <a href="/join.html">Sign in / Join</a><br>
        ${HOME_LINK_HTML}
      `;
      attachHomeHandler(closeMenu);
      return;
    }

    /* =====================================================
       ADMIN CHECK
    ===================================================== */

    let isAdmin = false;

    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (data) isAdmin = true;

    } catch (err) {
      console.warn("Admin lookup failed:", err.message);
    }

    /* =====================================================
       CLAIM LOOKUP
    ===================================================== */

    let approvedSlug = null;
    let pending = false;

    try {
      const { data: approved } = await supabase
        .from("player_claims")
        .select("slug")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .maybeSingle();

      if (approved) {
        approvedSlug = approved.slug;
      } else {
        const { data: pend } = await supabase
          .from("player_claims")
          .select("slug")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .maybeSingle();

        if (pend) pending = true;
      }

    } catch (err) {
      console.warn("Claim lookup blocked by RLS:", err.message);
    }

    /* =====================================================
       BUILD MENU (AUTHENTICATED)
    ===================================================== */

    let adminBlock = "";
    if (isAdmin) {
      adminBlock = `<a href="/admin/admin.html">Admin Panel</a><br>`;
    }

    let playerBlock = "";

    if (approvedSlug) {
      playerBlock = `
        <a href="/leaguetracker/player.html?player=${encodeURIComponent(approvedSlug)}">
          View My Player Page
        </a><br>
      `;
    } else if (pending) {
      playerBlock = `
        <div style="color:#c0392b;font-weight:700;font-size:0.9em;margin-top:6px;">
          Player ID verification pending
        </div>
      `;
    }

    slot.innerHTML = `
      <div style="opacity:.7;font-size:0.9em;margin-bottom:8px;">
        ${user.email}
      </div>

      ${adminBlock}
      ${playerBlock}

      <a href="/profile-edit.html">Edit Profile</a><br>
      ${HOME_LINK_HTML}
      <a href="#" id="logout-link">Sign out</a>
    `;

    attachHomeHandler(closeMenu);

    /* =====================================================
       LOGOUT
    ===================================================== */

    const logout = document.getElementById("logout-link");

    if (logout) {
      logout.onclick = async (e) => {
        e.preventDefault();
        try {
          await supabase.auth.signOut();
        } catch (err) {
          console.warn("Sign out failed:", err);
        }
        window.location.reload();
      };
    }

    /* =====================================================
       Helper
    ===================================================== */

    function attachHomeHandler(closeMenuFn) {
      const homeLink = document.getElementById("menu-home-link");
      if (homeLink) {
        homeLink.onclick = () => {
          closeMenuFn();
        };
      }
    }

  }

})();