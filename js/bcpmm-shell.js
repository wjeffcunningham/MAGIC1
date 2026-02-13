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
     Theme sync
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
     AUTH SLOT FILL
  ===================================================== */
  (async () => {

    if (!window.auth) return;

    const slot = document.getElementById("auth-slot");
    if (!slot) return;

    const supabase = auth._client;
    const user = await auth.getUser();

    /* -------------------------------
       Not signed in
    -------------------------------- */
    if (!user) {
      slot.innerHTML = `
        <a href="/join.html">Sign in / Join</a>
      `;
      return;
    }

    /* -------------------------------
       Check admin role
    -------------------------------- */
    let isAdmin = false;

    try {
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (role && role.role === "admin") {
        isAdmin = true;
      }
    } catch (e) {
      console.warn("Admin check failed:", e);
    }

    /* -------------------------------
       Check claim status
    -------------------------------- */
    let claimStatus = null;
    let approvedSlug = null;

    try {
      const { data: claim } = await supabase
        .from("player_claims")
        .select("slug, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (claim) {
        claimStatus = claim.status;
        if (claim.status === "approved") {
          approvedSlug = claim.slug;
        }
      }
    } catch (e) {
      console.warn("Claim check failed:", e);
    }

    /* -------------------------------
       Build claim block
    -------------------------------- */
    let claimBlock = "";

    if (claimStatus === "approved" && approvedSlug) {
      claimBlock = `
        <a href="/players/${approvedSlug}.html">View My Player Page</a><br>
      `;
    } else if (claimStatus === "pending") {
      claimBlock = `
        <div style="
          color:#f44336;
          font-size:0.85em;
          margin-top:4px;
          font-weight:600;
        ">
          Verification pending
        </div>
      `;
    } else {
      claimBlock = `
        <a href="/join.html">Claim a Profile</a><br>
      `;
    }

    /* -------------------------------
       Admin link
    -------------------------------- */
    let adminLink = "";
    if (isAdmin) {
      adminLink = `<a href="/admin.html">Admin Panel</a><br>`;
    }

    /* -------------------------------
       Render slot
    -------------------------------- */
    slot.innerHTML = `
      <span style="opacity:.7; font-size:0.9em">
        ${user.email}
      </span><br>
      ${adminLink}
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