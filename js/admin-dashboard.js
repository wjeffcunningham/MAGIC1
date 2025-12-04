// /js/admin-dashboard.js
import { supabase } from "/js/config.js";

/* -------------------------------------------------------
   DOM
-------------------------------------------------------- */
const notLogged  = document.getElementById("not-logged");
const notAdmin   = document.getElementById("not-admin");
const adminPanel = document.getElementById("admin-panel");

const pendingList = document.getElementById("pending-list");
const pendingCount = document.getElementById("pending-count");

/* -------------------------------------------------------
   INIT
-------------------------------------------------------- */
init();

async function init() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (!user) {
    showLoggedOut();
    return;
  }

  // load matching profile
  const { data: profile, error: profErr } = await supabase
    .from("site_users")
    .select("is_mod")
    .eq("id", user.id)
    .single();

  if (profErr || !profile) {
    showLoggedOut();
    return;
  }

  if (!profile.is_mod) {
    showNotAdmin();
    return;
  }

  showAdmin();
  await loadPendingUsers();
}

/* -------------------------------------------------------
   STATE DISPLAY
-------------------------------------------------------- */
function showLoggedOut() {
  notLogged.classList.remove("hidden");
  notAdmin.classList.add("hidden");
  adminPanel.classList.add("hidden");
}

function showNotAdmin() {
  notLogged.classList.add("hidden");
  notAdmin.classList.remove("hidden");
  adminPanel.classList.add("hidden");
}

function showAdmin() {
  notLogged.classList.add("hidden");
  notAdmin.classList.add("hidden");
  adminPanel.classList.remove("hidden");
}

/* -------------------------------------------------------
   LOAD PENDING USERS
-------------------------------------------------------- */
async function loadPendingUsers() {
  pendingList.innerHTML = "<p class='muted'>Loading…</p>";

  const { data, error } = await supabase
    .from("site_users")
    .select("id, email, handle, image, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    pendingList.innerHTML = `<p class='muted'>Error loading: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    pendingList.innerHTML = `<p class='muted'>No pending users.</p>`;
    pendingCount.textContent = "";
    return;
  }

  pendingCount.textContent = `${data.length} pending`;

  pendingList.innerHTML = data
    .map(
      u => `
      <div class="row">
        <div class="row-main">
          <img src="${u.image || "/assets/default-avatar.png"}" 
               style="width:34px;height:34px;border-radius:8px;border:1px solid #000;object-fit:cover;margin-right:10px;" />
          <div>
            <div><strong>${u.email}</strong></div>
            <div class="small-muted">Handle: ${u.handle}</div>
          </div>
        </div>
        
        <div class="controls">
          <button class="btn primary" onclick="approveUser('${u.id}')">Approve</button>
          <button class="btn danger" onclick="rejectUser('${u.id}')">Reject</button>
        </div>
      </div>
    `
    )
    .join("");
}

/* -------------------------------------------------------
   APPROVE / REJECT
-------------------------------------------------------- */
window.approveUser = async function (uid) {
  const { error } = await supabase
    .from("site_users")
    .update({ status: "approved" })
    .eq("id", uid);

  if (error) {
    alert("Error: " + error.message);
    return;
  }

  await loadPendingUsers(); // reload list
};

window.rejectUser = async function (uid) {
  const { error } = await supabase
    .from("site_users")
    .update({ status: "rejected" })
    .eq("id", uid);

  if (error) {
    alert("Error: " + error.message);
    return;
  }

  await loadPendingUsers();
};