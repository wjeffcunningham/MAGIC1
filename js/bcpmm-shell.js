(function () {

  const root = document.getElementById("global-menu-root");
  if (!root) return;

  /* =====================================================
     Inject Menu HTML
  ===================================================== */
  root.innerHTML = `
    <div class="menu-button" id="menu-btn">☰</div>
    <div class="menu-overlay" id="menu-overlay"></div>

    <div class="menu-panel" id="menu-panel">
      <div class="menu-header">
        <strong>Menu</strong>
        <span class="menu-close" id="menu-close">✕</span>
      </div>

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
     Menu Open / Close
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
     Theme Handling
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
  syncIcon();

  /* =====================================================
     AUTH + ROLE + CLAIM STATUS
  ===================================================== */
  (async () => {

    if (!window.auth) return;

    const slot = document.getElementById("auth-slot");
    const supabase = auth._client;

    const user = await auth.getUser();

    /* -------------------------
       Not signed in
    -------------------------- */
    if (!user) {
      slot.innerHTML = `<a href="/join.html">Sign in / Join</a>`;
      return;
    }

    /* -------------------------
       Admin Check
    -------------------------- */
    let isAdmin = false;

    try {
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (role) isAdmin = true;
    } catch (err) {
      console.warn("Admin lookup failed:", err);
    }

    /* -------------------------
       Claim Lookup (Safe)
    -------------------------- */
    let approvedSlug = null;
    let pending = false;

    try {
      const { data: approvedClaim } = await supabase
        .from("player_claims")
        .select("slug")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .maybeSingle();

      if (approvedClaim) {
        approvedSlug = approvedClaim.slug;
      } else {
        const { data: pendingClaim } = await supabase
          .from("player_claims")
          .select("slug")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .maybeSingle();

        if (pendingClaim) pending = true;
      }

    } catch (err) {
      console.warn("Claim lookup failed:", err);
    }

    /* -------------------------
       Build Blocks
    -------------------------- */

    let adminBlock = "";
    if (isAdmin) {
      adminBlock = `<a href="admin/admin.html">Admin Panel</a><br>`;
    }

    let playerBlock = "";

    if (approvedSlug) {
      playerBlock = `
        <a href="/player.html?player=${approvedSlug}">
          View My Player Page
        </a><br>
      `;
    } else if (pending) {
      playerBlock = `
        <div style="
          color:#c0392b;
          font-weight:700;
          font-size:0.9em;
          margin-top:6px;
          display:flex;
          align-items:center;
          gap:6px;
        ">
          <span style="
            width:8px;
            height:8px;
            background:#c0392b;
            border-radius:50%;
            display:inline-block;
          "></span>
          Player ID verification pending
        </div>
      `;
    }

    /* -------------------------
       Render Menu
    -------------------------- */

    slot.innerHTML = `
      <div style="opacity:.7;font-size:0.9em;margin-bottom:8px;">
        ${user.email}
      </div>

      ${adminBlock}
      ${playerBlock}

      <a href="/profile-edit.html">Edit Profile</a><br>
      <a href="#" id="logout-link">Sign out</a>
    `;

    document.getElementById("logout-link").onclick = async (e) => {
      e.preventDefault();
      await auth.signOut();
      location.reload();
    };

  })();

})();