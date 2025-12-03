// /js/admin-dashboard.js
import { supabase } from "./config.js";
import { getProfile } from "./db.js";

const notLogged   = document.getElementById("not-logged");
const notAdmin    = document.getElementById("not-admin");
const adminPanel  = document.getElementById("admin-panel");
const pendingList = document.getElementById("pending-list");
const pendingCountEl = document.getElementById("pending-count");

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadPending() {
  pendingList.innerHTML = "Loading…";

  const { data, error } = await supabase
    .from("users")
    .select("id, email, name, verified, created_at")
    .eq("verified", false)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadPending error", error);
    pendingList.innerHTML = "<div class='muted'>Error loading pending users.</div>";
    pendingCountEl.textContent = "";
    return;
  }

  if (!data.length) {
    pendingList.innerHTML = "<div class='muted'>No pending users.</div>";
    pendingCountEl.textContent = "0 users pending.";
    return;
  }

  pendingCountEl.textContent = `${data.length} user${data.length === 1 ? "" : "s"} pending.`;

  pendingList.innerHTML = data.map(u => `
    <div class="row">
      <div class="row-main">
        <div>${escapeHtml(u.name || u.email || "Unknown")}</div>
        <div class="muted">${escapeHtml(u.email || "")}</div>
      </div>
      <div>
        <span class="tag">created ${new Date(u.created_at).toLocaleDateString()}</span>
        <button class="btn primary" data-action="approve" data-id="${u.id}">Approve</button>
      </div>
    </div>
  `).join("");

  // Wire up buttons
  pendingList.querySelectorAll("button[data-action='approve']").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = "Saving…";
      const { error: upErr } = await supabase
        .from("users")
        .update({ verified: true })
        .eq("id", id);
      if (upErr) {
        console.error("approve user error", upErr);
        btn.disabled = false;
        btn.textContent = "Approve";
        return;
      }
      await loadPending();
    };
  });
}

async function init() {
  const profile = await getProfile();

  if (!profile) {
    notLogged.style.display = "block";
    return;
  }
  notLogged.style.display = "none";

  if (!profile.is_mod) {
    notAdmin.classList.remove("hidden");
    return;
  }

  notAdmin.classList.add("hidden");
  adminPanel.classList.remove("hidden");

  await loadPending();
}

init();