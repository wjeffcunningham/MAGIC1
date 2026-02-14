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

  const saved = localStorage.getItem("bcpmm-theme");
  if (saved === "dark") document.body.classList.add("dark");
  syncIcon();

  /* =====================================================
     AUTH + ROLE + CLAIM
  ===================================================== */
  (async () => {

    if (!window.auth) return;

    const slot = document.getElementById("auth-slot");
    const supabase = auth._client;
    const user = await auth.getUser();

    if (!user) {
      slot.innerHTML = `
        <a href="/join.html">Sign in / Join</a>
      `;
      return;
    }

    /* -------------------------------
       Admin check
    -------------------------------- */
    let isAdmin = false;

    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (role) isAdmin = true;

    /* -------------------------------
       Claim resolution
       Approved always wins
    -------------------------------- */
    let approvedSlug = null;
    let pending = false;

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

    /* -------------------------------
       Build claim UI
    -------------------------------- */
    let claimBlock = "";

    if (approvedSlug) {
      claimBlock = `
        <a href="/players/${approvedSlug}.html">
          View My Player Page
        </a><br>
      `;
    } else if (pending) {
      claimBlock = `
        <div style="
          color:#f44336;
          font-weight:700;
          font-size:0.85em;
          margin-top:4px;
        ">
          Player ID verification pending
        </div>
      `;
    } else {
      claimBlock = `
        <a href="/profile-edit.html">
          Claim Tournament Identity
        </a><br>
      `;
    }

    /* -------------------------------
       Admin link
    -------------------------------- */
    let adminBlock = "";
    if (isAdmin) {
      adminBlock = `
        <a href="/admin.html">Admin Panel</a><br>
      `;
    }

    /* -------------------------------
       Render
    -------------------------------- */
    slot.innerHTML = `
      <span style="opacity:.7;font-size:0.9em">
        ${user.email}
      </span><br>
      ${adminBlock}
      ${claimBlock}
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