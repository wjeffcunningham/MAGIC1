// /js/admin-dashboard.js

import { supabase } from "./config.js";
import {
  getProfile,
  approveUser,
  rejectUser,
  overrideHandle,
  setPaymentStatus,
  removeLeagueMemberRow,
} from "./db.js";

const notLogged   = document.getElementById("not-logged");
const notAdmin    = document.getElementById("not-admin");
const adminPanel  = document.getElementById("admin-panel");

const pendingCountEl = document.getElementById("pending-count");
const pendingList    = document.getElementById("pending-list");
const userList       = document.getElementById("user-list");
const leagueList     = document.getElementById("league-list");

// Current season code
const CURRENT_SEASON = "26-BCWL-01";

async function init() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    notLogged.classList.remove("hidden");
    return;
  }

  const profile = await getProfile();
  if (!profile || !profile.is_mod) {
    notLogged.classList.add("hidden");
    notAdmin.classList.remove("hidden");
    return;
  }

  // Admin OK:
  notLogged.classList.add("hidden");
  notAdmin.classList.add("hidden");
  adminPanel.classList.remove("hidden");

  await loadPending();
  await loadUsers();
  await loadLeagueMembers();
}

// ---------- Pending users ----------

async function loadPending() {
  const { data, error } = await supabase
    .from("site_users")
    .select("id, email, handle, moderated_handle, image")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    pendingList.innerHTML = "<p>Error loading pending users.</p>";
    return;
  }

  pendingCountEl.textContent = `${data.length} pending`;
  pendingList.innerHTML = "";

  if (!data.length) {
    pendingList.innerHTML = "<p>No pending users.</p>";
    return;
  }

  data.forEach(u => {
    const displayHandle = u.moderated_handle || u.handle || "(no handle)";

    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="row-main">
        <img src="${u.image || "/assets/default-avatar.png"}" alt="">
        <div>
          <div>${displayHandle}</div>
          <div class="small-muted">${u.email}</div>
        </div>
      </div>
      <div class="controls">
        <button class="btn primary" data-id="${u.id}" data-action="approve">Approve</button>
        <button class="btn" data-id="${u.id}" data-action="reject">Reject</button>
      </div>
    `;

    pendingList.appendChild(row);
  });

  pendingList.querySelectorAll("button").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      if (action === "approve") {
        await approveUser(id);
      } else if (action === "reject") {
        await rejectUser(id);
      }

      await loadPending();
      await loadUsers();
      await loadLeagueMembers();
    };
  });
}

// ---------- Manage Users (approved accounts) ----------

async function loadUsers() {
  const { data, error } = await supabase
    .from("site_users")
    .select("id, email, handle, moderated_handle, image, payment_status")
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (error) {
    userList.innerHTML = "<p>Error loading users.</p>";
    return;
  }

  userList.innerHTML = "";

  if (!data.length) {
    userList.innerHTML = "<p>No approved users yet.</p>";
    return;
  }

  data.forEach(u => {
    const displayHandle = u.moderated_handle || u.handle || "(no handle)";
    const payment = u.payment_status || "unpaid";

    const row = document.createElement("div");
    row.className = "row";

    row.innerHTML = `
      <div class="row-main">
        <img src="${u.image || "/assets/default-avatar.png"}" alt="">
        <div>
          <div>${displayHandle}</div>
          <div class="small-muted">${u.email}</div>
        </div>
      </div>

      <div class="controls">
        <input class="handle-input" type="text"
          placeholder="${u.handle || ""}"
          value="${u.moderated_handle || ""}"
          data-id="${u.id}" />

        <button class="btn" data-id="${u.id}" data-action="save-handle">Save Handle</button>

        <span class="small-muted">Payment:</span>
        <button class="btn ${payment === "paid" ? "primary" : ""}"
          data-id="${u.id}" data-pay="paid">Paid</button>
        <button class="btn ${payment === "unpaid" ? "primary" : ""}"
          data-id="${u.id}" data-pay="unpaid">Unpaid</button>
        <button class="btn ${payment === "pending" ? "primary" : ""}"
          data-id="${u.id}" data-pay="pending">Pending</button>
      </div>
    `;

    userList.appendChild(row);
  });

  userList.querySelectorAll("[data-action='save-handle']").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const input = userList.querySelector(`.handle-input[data-id='${id}']`);
      const newHandle = input.value.trim();

      if (!newHandle) return;

      await overrideHandle(id, newHandle);
      await loadUsers();
      await loadLeagueMembers();
    };
  });

  userList.querySelectorAll("[data-pay]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const status = btn.dataset.pay;

      await setPaymentStatus(id, status);
      await loadUsers();
    };
  });
}

// ---------- League Members (current season) ----------

async function loadLeagueMembers() {
  const { data, error } = await supabase
    .from("league_members")
    .select(`
      id,
      payment_status,
      user_id,
      site_users (handle, moderated_handle, image, email)
    `)
    .eq("season", CURRENT_SEASON)
    .order("joined_at", { ascending: true });

  if (error) {
    leagueList.innerHTML = "<p>Error loading league members.</p>";
    return;
  }

  leagueList.innerHTML = "";

  if (!data.length) {
    leagueList.innerHTML = "<p>No members in this season yet.</p>";
    return;
  }

  data.forEach(row => {
    const u = row.site_users;
    const displayHandle = (u && (u.moderated_handle || u.handle)) || "(unknown)";
    const payment = row.payment_status || "unpaid";

    const el = document.createElement("div");
    el.className = "row";
    el.innerHTML = `
      <div class="row-main">
        <img src="${(u && u.image) || "/assets/default-avatar.png"}" alt="">
        <div>
          <div>${displayHandle}</div>
          <div class="small-muted">${u ? u.email : ""}</div>
        </div>
      </div>
      <div class="controls">
        <span class="small-muted">Payment: ${payment}</span>
        <button class="btn danger" data-row="${row.id}" data-action="remove">Remove</button>
      </div>
    `;
    leagueList.appendChild(el);
  });

  leagueList.querySelectorAll("[data-action='remove']").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.row;
      await removeLeagueMemberRow(id);
      await loadLeagueMembers();
    };
  });
}

init();