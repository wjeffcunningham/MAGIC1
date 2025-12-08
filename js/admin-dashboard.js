// /js/admin-dashboard.js
import { supabase } from "./config.js";
import { getProfile, CURRENT_SEASON } from "./db.js";
import {
  approveUser,
  rejectUser,
  overrideHandle,
  setLeaguePaymentStatus,
  setLeagueConfirmed,
  removeLeagueMemberRow
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

/* -------------------------------------------------------
   EMAIL HELPERS (always POST, never GET)
-------------------------------------------------------- */

async function sendSignupApprovedEmail(email, name) {
  try {
    const resp = await fetch("https://magic1-signup-approved-email.wjeffcunningham.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name: name || ""
      })
    });
    console.log("[signup-approved email worker]", await resp.text());
  } catch (err) {
    console.error("[signup-approved email worker ERROR]", err);
  }
}

async function sendLeagueConfirmedEmail(email, name) {
  try {
    const resp = await fetch("https://magic1-league-confirm-email.wjeffcunningham.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name: name || "",
        season: CURRENT_SEASON
      })
    });
    console.log("[league-confirm email worker]", await resp.text());
  } catch (err) {
    console.error("[league-confirm email worker ERROR]", err);
  }
}

/* -------------------------------------------------------
   PENDING USERS
-------------------------------------------------------- */
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

  pendingCount.textContent = `${data.length} pending signup${data.length === 1 ? "" : "s"}.`;

  data.forEach(u => {
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

      // SEND APPROVAL EMAIL (POST-only)
      await sendSignupApprovedEmail(u.email, u.handle);

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

/* -------------------------------------------------------
   MANAGE USERS
-------------------------------------------------------- */
async function loadUsers() {
  if (!usersList || !usersCount) return;

  clearNode(usersList);
  usersList.textContent = "Loading…";

  const { data: users, error: usersErr } = await supabase
    .from("site_users")
    .select("id, email, handle, moderated_handle, status, is_mod, created_at")
    .order("created_at", { ascending: true });

  if (usersErr) {
    console.error("users error", usersErr);
    usersList.textContent = "Error loading users.";
    usersCount.textContent = "";
    return;
  }

  const { data: members, error: memErr } = await supabase
    .from("league_members")
    .select("id, user_id, payment_status, confirmed")
    .eq("season", CURRENT_SEASON);

  const memberByUser = new Map();
  if (!memErr && members) {
    members.forEach(m => memberByUser.set(m.user_id, m));
  }

  clearNode(usersList);

  if (!users || users.length === 0) {
    usersList.textContent = "No users yet.";
    usersCount.textContent = "0 accounts.";
    return;
  }

  usersCount.textContent = `${users.length} account${users.length === 1 ? "" : "s"}.`;

  users.forEach(u => {
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

    const leagueInfo = document.createElement("div");
    leagueInfo.className = "small-muted";

    const membership = memberByUser.get(u.id);
    if (membership) {
      const statusParts = [];
      statusParts.push(`In ${CURRENT_SEASON}`);
      statusParts.push(membership.payment_status || "unpaid");
      statusParts.push(membership.confirmed ? "confirmed" : "unconfirmed");
      leagueInfo.textContent = statusParts.join(" • ");
    } else {
      leagueInfo.textContent = `Not in ${CURRENT_SEASON}`;
    }

    main.appendChild(topLine);
    main.appendChild(subLine);
    main.appendChild(statusTag);
    if (u.is_mod) main.appendChild(modTag);
    main.appendChild(leagueInfo);

    const controls = document.createElement("div");
    controls.className = "controls";

    // Handle override
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

    controls.appendChild(handleInput);
    controls.appendChild(saveHandleBtn);

    row.appendChild(main);
    row.appendChild(controls);
    usersList.appendChild(row);
  });
}

/* -------------------------------------------------------
   LEAGUE MEMBERS
-------------------------------------------------------- */
async function loadLeague() {
  if (!leagueList || !leagueCount) return;

  clearNode(leagueList);
  leagueList.textContent = "Loading…";

  const { data: members, error } = await supabase
    .from("league_members")
    .select("id, user_id, payment_status, confirmed, joined_at")
    .eq("season", CURRENT_SEASON)
    .order("joined_at", { ascending: true });

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

  const userIds = [...new Set(members.map(m => m.user_id))];

  const { data: users, error: usersErr } = await supabase
    .from("site_users")
    .select("id, email, handle, moderated_handle")
    .in("id", userIds);

  if (usersErr) {
    console.error("league users error", usersErr);
    leagueList.textContent = "Error loading player profiles.";
    leagueCount.textContent = "";
    return;
  }

  const userById = new Map(users.map(u => [u.id, u]));

  clearNode(leagueList);

  members.forEach(m => {
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

    // Payment status widget
    const paySelect = document.createElement("select");
    paySelect.className = "handle-input";

    ["unpaid", "paid", "comped"].forEach(val => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      if ((m.payment_status || "unpaid") === val) opt.selected = true;
      paySelect.appendChild(opt);
    });

    paySelect.onchange = async () => {
      const val = paySelect.value;
      paySelect.disabled = true;
      const { error } = await setLeaguePaymentStatus(m.id, val);
      if (error) console.error("setLeaguePaymentStatus error", error);
      paySelect.disabled = false;
    };

    // Confirmation checkbox
    const confirmLabel = document.createElement("label");
    confirmLabel.className = "small-muted";

    const confirmCheckbox = document.createElement("input");
    confirmCheckbox.type = "checkbox";
    confirmCheckbox.checked = !!m.confirmed;
    confirmCheckbox.style.marginRight = "4px";

    confirmCheckbox.onchange = async () => {
      const newVal = confirmCheckbox.checked;
      confirmCheckbox.disabled = true;

      const { error } = await setLeagueConfirmed(m.id, newVal);
      if (error) {
        console.error("setLeagueConfirmed error", error);
      } else if (newVal) {
        // FIRE CONFIRMATION EMAIL
        await sendLeagueConfirmedEmail(u.email, name);
      }

      confirmCheckbox.disabled = false;
    };

    confirmLabel.appendChild(confirmCheckbox);
    confirmLabel.appendChild(document.createTextNode("confirmed"));

    // Remove member
    const removeBtn = document.createElement("button");
    removeBtn.className = "btn danger";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = async () => {
      if (!window.confirm("Remove this player from the league?")) return;
      removeBtn.disabled = true;
      const { error } = await removeLeagueMemberRow(m.id);
      if (error) console.error("removeLeagueMemberRow error", error);
      await loadUsers();
      await loadLeague();
    };

    controls.appendChild(paySelect);
    controls.appendChild(confirmLabel);
    controls.appendChild(removeBtn);

    row.appendChild(main);
    row.appendChild(controls);
    leagueList.appendChild(row);
  });

  leagueCount.textContent = `${members.length} member${members.length === 1 ? "" : "s"} in ${CURRENT_SEASON}.`;
}

/* -------------------------------------------------------
   INIT
-------------------------------------------------------- */
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