// /js/admin-dashboard.js
import { supabase } from "./config.js";
import { getProfile } from "./db.js";

const notLogged      = document.getElementById("not-logged");
const notAdmin       = document.getElementById("not-admin");
const adminPanel     = document.getElementById("admin-panel");
const pendingList    = document.getElementById("pending-list");
const pendingCountEl = document.getElementById("pending-count");

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadPending() {
  pendingList.innerHTML = "<div class='muted'>Loading pending users…</div>";
  pendingCountEl.textContent = "";

  const { data, error } = await supabase
    .from("users")
    .select("id, email, name, created_at")
    .eq("verified", false)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadPending error", error);
    pendingList.innerHTML = "<div class='muted'>Error loading pending users.</div>";
    pendingCountEl.textContent = "";
    return;
  }

  if (!data || data.length === 0) {
    pendingCountEl.textContent = "No users pending approval.";
    pendingList.innerHTML = "<div class='muted'>No pending users.</div>";
    return;
  }

  pendingCountEl.textContent =
    `${data.length} user${data.length > 1 ? "s" : ""} pending approval.`;

  pendingList.innerHTML = data
    .map(u => `
      <div class="list-row">
        <span>
          <strong>${escapeHtml(u.name || u.email)}</strong><br>
          <span class="muted">${escapeHtml(u.email)}</span>
        </span>
        <button class="btn approve-btn" data-id="${u.id}">
          Approve
        </button>
      </div>
    `)
    .join("");

  pendingList.querySelectorAll(".approve-btn").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = "Approving…";

      const { error: upErr } = await supabase
        .from("users")
        .update({ verified: true })
        .eq("id", id);

      if (upErr) {
        console.error("approve error", upErr);
        alert("Error approving user.");
        btn.disabled = false;
        btn.textContent = "Approve";
        return;
      }

      // Reload list so pending count & UI update
      await loadPending();
    };
  });
}

async function init() {
  const profile = await getProfile();

  if (!profile) {
    if (notLogged)  notLogged.style.display  = "block";
    if (notAdmin)   notAdmin.classList.add("hidden");
    if (adminPanel) adminPanel.classList.add("hidden");
    return;
  }

  if (notLogged) notLogged.style.display = "none";

  if (!profile.is_mod) {
    if (notAdmin)   notAdmin.classList.remove("hidden");
    if (adminPanel) adminPanel.classList.add("hidden");
    return;
  }

  if (notAdmin)   notAdmin.classList.add("hidden");
  if (adminPanel) adminPanel.classList.remove("hidden");

  await loadPending();
}

init();