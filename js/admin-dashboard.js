// /js/admin-dashboard.js
import { supabase } from "./config.js";
import { getProfile, CURRENT_SEASON } from "./db.js";
import {
  approveUser,
  rejectUser,
  overrideHandle,
  setPaymentStatus,
  removeLeagueMemberRow,
} from "./admin-api.js";

const notLogged   = document.getElementById("not-logged");
const notAdmin    = document.getElementById("not-admin");
const adminPanel  = document.getElementById("admin-panel");

const pendingCount = document.getElementById("pending-count");
const pendingList  = document.getElementById("pending-list");

const usersCount   = document.getElementById("users-count");
const usersList    = document.getElementById("users-list");

const leagueCount  = document.getElementById("league-count");
const leagueList   = document.getElementById("league-list");

function clearNode(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

function nameForUser(u) {
  return u.moderated_handle || u.handle || u.email;
}

/* -----------------------------------------
   Pending users
----------------------------------------- */
async function loadPending() {
  if (!pendingList || !pendingCount) return;

  clearNode(pendingList);
  pendingList.textContent = "Loading…";

  const { data, error } = await supabase
    .from("site_users")
    .select("id, email, handle, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("pending users error", error);
    pendingList.textContent = "Error loading pending users.";
    pendingCount.textContent = "";
    return;
  }

  clearNode(pendingList);

  if (!data || data.length === 0) {
    pendingList.textContent = "No pending sign-ups.";
    pendingCount.textContent = "0 pending.";
    return;
  }

  pendingCount.textContent =
    `${data.length} pending signup${data.length === 1 ? "" : "s"}.`;

  data.forEach((u) => {
    const row = document.createElement("div");
    row.className = "row";

    const main = document.createElement("div");
    main.className = "row-main";
    main.innerHTML = `
      <div>
        <strong>${u.email}</strong>
        ${u.handle ? `<span class="small-muted">(${u.handle})</span>` : ""}
      </div>
      <div class="small-muted">
        ${u.created_at ? new Date(u.created_at).toLocaleString() : ""}
      </div>
    `;

    const controls = document.createElement("div");
    controls.className = "controls";

    const approveBtn = document.createElement("button");
    approveBtn.className = "btn primary";
    approveBtn.textContent = "Approve";
    approveBtn.onclick = async () => {
      approveBtn.disabled = true;
      const { error: err } = await approveUser(u.id);
      if (err) console.error("approve error", err);
      await loadPending();
      await loadUsers();
      await loadLeague();
    };

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "btn";
    rejectBtn.textContent = "Reject";
    rejectBtn.onclick = async () => {
      rejectBtn.disabled = true;
      const { error: err } = await rejectUser(u.id);
      if (err) console.error("reject error", err);
      await loadPending();
      await loadUsers();
      await loadLeague();
    };

    controls.appendChild(approveBtn);
    controls.appendChild(rejectBtn);

    row.appendChild(main);
    row.appendChild(controls);
    pendingList.appendChild(row);
  });
}

/* -----------------------------------------
   All users + league membership snapshot
----------------------------------------- */
async function loadUsers() {
  if (!usersList || !usersCount) return;

  clearNode(usersList);
  usersList.textContent = "Loading…";

  const { data: users, error: usersErr } = await supabase
    .from("site_users")
    .select(
      "id, email, handle, moderated_handle, status, payment_status, is_mod, created_at"
    )
    .order("created_at", { ascending: true });

  if (usersErr) {
    console.error("users error", usersErr);
    usersList.textContent = "Error loading users.";
    usersCount.textContent = "";
    return;
  }

  const { data: members, error: membersErr } = await supabase
    .from("league_members")
    .select("id, user_id, payment_status")
    .eq("season", CURRENT_SEASON);

  const memberByUser = new Map();
  if (!membersErr && members) {
    members.forEach((m) => memberByUser.set(m.user_id, m));
  }

  clearNode(usersList);

  if (!users || users.length === 0) {
    usersList.textContent = "No users yet.";
    usersCount.textContent = "0 accounts.";
    return;
  }

  usersCount.textContent =
    `${users.length} account${users.length === 1 ? "" : "s"}.`;

  users.forEach((u) => {
    const row = document.createElement("div");
    row.className = "row";

    const main = document.createElement("div");
    main.className = "row-main";

    const statusTag = document.createElement("span");
    statusTag.className = "tag";
    statusTag.textContent = u.status || "unknown";

    const modTag = document.createElement("span");
    if (u.is_mod) {
      modTag.className = "tag";
      modTag.textContent = "mod";
    }

    const topLine = document.createElement("div");
    topLine.innerHTML = `<strong>${nameForUser(u)}</strong>`;

    const subLine = document.createElement("div");
    subLine.className = "small-muted";
    subLine.textContent = u.email;

    main.appendChild(topLine);
    main.appendChild(subLine);
    main.appendChild(statusTag);
    if (u.is_mod) main.appendChild(modTag);

    const controls = document.createElement("div");
    controls.className = "controls";

    // Handle override input
    const handleInput = document.createElement("input");
    handleInput.className = "handle-input";
    handleInput.placeholder = "override handle";
    handleInput.value = u.moderated_handle || u.handle || "";

    const saveHandleBtn = document.createElement("button");
    saveHandleBtn.className = "btn";
    saveHandleBtn.textContent = "Save Handle";
    saveHandleBtn.onclick = async () => {
      saveHandleBtn.disabled = true;
      const newVal = handleInput.value.trim() || null;
      const { error } = await overrideHandle(u.id, newVal);
      if (error) console.error("overrideHandle error", error);
      saveHandleBtn.disabled = false;
    };

    // Payment status select
    const paySelect = document.createElement("select");
    paySelect.className = "handle-input";
    const options = ["", "unpaid", "paid", "comped"];
    options.forEach((val) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val === "" ? "(no status)" : val;
      if ((u.payment_status || "") === val) opt.selected = true;
      paySelect.appendChild(opt);
    });

    paySelect.onchange = async () => {
      const val = paySelect.value || null;
      const { error } = await setPaymentStatus(u.id, val);
      if (error) console.error("setPaymentStatus error", error);
    };

    const membership = memberByUser.get(u.id);
    const leagueInfo = document.createElement("span");
    leagueInfo.className = "small-muted";
    if (membership) {
      leagueInfo.textContent =
        `In ${CURRENT_SEASON} (league row ${membership.id})`;
    } else {
      leagueInfo.textContent = `Not in ${CURRENT_SEASON}`;
    }

    const removeFromLeagueBtn = document.createElement("button");
    removeFromLeagueBtn.className = "btn danger";
    removeFromLeagueBtn.textContent = "Remove from league";
    removeFromLeagueBtn.disabled = !membership;

    removeFromLeagueBtn.onclick = async () => {
      if (!membership) return;
      removeFromLeagueBtn.disabled = true;
      const { error } = await removeLeagueMemberRow(membership.id);
      if (error) console.error("removeLeagueMemberRow error", error);
      await loadUsers();
      await loadLeague();
    };

    controls.appendChild(handleInput);
    controls.appendChild(saveHandleBtn);
    controls.appendChild(paySelect);
    controls.appendChild(leagueInfo);
    controls.appendChild(removeFromLeagueBtn);

    row.appendChild(main);
    row.appendChild(controls);
    usersList.appendChild(row);
  });
}

/* -----------------------------------------
   League members list
----------------------------------------- */
async function loadLeague() {
  if (!leagueList || !leagueCount) return;

  clearNode(leagueList);
  leagueList.textContent = "Loading…";

  const { data: members, error } = await supabase
    .from("league_members")
    .select("id, user_id, payment_status, created_at")
    .eq("season", CURRENT_SEASON)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("league_members error", error);
    leagueList.textContent = "Error loading league members.";
    leagueCount.textContent = "";
    return;
  }

  if (!members || members.length === 0) {
    leagueList.textContent = "No members in this season yet.";
    leagueCount.textContent = "0 players.";
    return;
  }

  const userIds = [...new Set(members.map((m) => m.user_id))];

  const { data: users, error: usersErr } = await supabase
    .from("site_users")
    .select("id, email, handle, moderated_handle, avatar_url")
    .in("id", userIds);

  if (usersErr) {
    console.error("league users error", usersErr);
    leagueList.textContent = "Error loading player profiles.";
    leagueCount.textContent = "";
    return;
  }

  const userById = new Map(users.map((u) => [u.id, u]));

  clearNode(leagueList);

  members.forEach((m) => {
    const u = userById.get(m.user_id);
    if (!u) return;

    const row = document.createElement("div");
    row.className = "row";

    const main = document.createElement("div");
    main.className = "row-main";
    const name = nameForUser(u);

    main.innerHTML = `
      <div><strong>${name}</strong></div>
      <div class="small-muted">${u.email}</div>
    `;

    const controls = document.createElement("div");
    controls.className = "controls";

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = m.payment_status || "unpaid";

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn danger";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = async () => {
      removeBtn.disabled = true;
      const { error } = await removeLeagueMemberRow(m.id);
      if (error) console.error("removeLeagueMemberRow error", error);
      await loadUsers();
      await loadLeague();
    };

    controls.appendChild(tag);
    controls.appendChild(removeBtn);

    row.appendChild(main);
    row.appendChild(controls);
    leagueList.appendChild(row);
  });

  leagueCount.textContent =
    `${members.length} member${members.length === 1 ? "" : "s"} in ${CURRENT_SEASON}.`;
}

/* -----------------------------------------
   INIT
----------------------------------------- */
async function init() {
  const profile = await getProfile();

  if (!profile) {
    if (notLogged) notLogged.classList.remove("hidden");
    if (notAdmin) notAdmin.classList.add("hidden");
    if (adminPanel) adminPanel.classList.add("hidden");
    return;
  }

  if (!profile.is_mod) {
    if (notLogged) notLogged.classList.add("hidden");
    if (notAdmin) notAdmin.classList.remove("hidden");
    if (adminPanel) adminPanel.classList.add("hidden");
    return;
  }

  if (notLogged) notLogged.classList.add("hidden");
  if (notAdmin) notAdmin.classList.add("hidden");
  if (adminPanel) adminPanel.classList.remove("hidden");

  await loadPending();
  await loadUsers();
  await loadLeague();
}

document.addEventListener("DOMContentLoaded", init);