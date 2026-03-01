/* =====================================================
   Admin Dashboard — Stable Auth Version
===================================================== */

import { getProfile, CURRENT_SEASON } from "./db.js";

/* -------------------------------------------------------
   Supabase Client (Single Source of Truth)
-------------------------------------------------------- */

const supabase = window.auth._client;

/* -------------------------------------------------------
   DOM
-------------------------------------------------------- */

const notLogged  = document.getElementById("not-logged");
const notAdmin   = document.getElementById("not-admin");
const adminPanel = document.getElementById("admin-panel");

const usersCount  = document.getElementById("users-count");
const usersList   = document.getElementById("users-list");

const leagueCount = document.getElementById("league-count");
const leagueList  = document.getElementById("league-list");

/* -------------------------------------------------------
   Helpers
-------------------------------------------------------- */

function clearNode(n) {
  while (n?.firstChild) n.removeChild(n.firstChild);
}

function displayName(u) {
  return u.moderated_handle || u.handle || u.email;
}

function showError(prefix, error) {
  const msg = error?.message || "Unknown error";
  alert(`${prefix}: ${msg}`);
  console.error(prefix, error);
}

/* -------------------------------------------------------
   USERS (site_users)
-------------------------------------------------------- */

async function loadUsers() {
  clearNode(usersList);

  const { data: users, error } = await supabase
    .from("site_users")
    .select("id,email,handle,moderated_handle")
    .order("created_at");

  if (error) {
    usersList.textContent = "Failed to load users.";
    showError("Load users failed", error);
    return;
  }

  usersCount.textContent = `${users.length} accounts.`;

  users.forEach(u => {
    const row = document.createElement("div");
    row.className = "row";

    row.innerHTML = `
      <div class="row-main">
        <strong>${displayName(u)}</strong>
        <div class="muted">${u.email}</div>
      </div>
    `;

    const input = document.createElement("input");
    input.className = "handle-input";
    input.value = u.moderated_handle || u.handle || "";

    const save = document.createElement("button");
    save.className = "btn";
    save.textContent = "Override name";

    save.onclick = async () => {
      const { error } = await supabase
        .from("site_users")
        .update({ moderated_handle: input.value.trim() || null })
        .eq("id", u.id);

      if (error) {
        showError("Override name failed", error);
      }
    };

    const controls = document.createElement("div");
    controls.className = "controls";
    controls.append(input, save);

    row.appendChild(controls);
    usersList.appendChild(row);
  });
}

/* -------------------------------------------------------
   LEAGUE MEMBERS (league_members)
-------------------------------------------------------- */

async function loadLeague() {
  clearNode(leagueList);

  const { data: members, error } = await supabase
    .from("league_members")
    .select("id,user_id,payment_status,banned")
    .eq("season", CURRENT_SEASON);

  if (error) {
    leagueList.textContent = "Failed to load league members.";
    showError("Load league members failed", error);
    return;
  }

  leagueCount.textContent = `${members.length} members.`;

  for (const m of members) {
    const { data: u, error: userErr } = await supabase
      .from("site_users")
      .select("email,handle,moderated_handle")
      .eq("id", m.user_id)
      .single();

    if (userErr || !u) {
      console.warn("Skipping member, user lookup failed", userErr);
      continue;
    }

    const row = document.createElement("div");
    row.className = "row";

    row.innerHTML = `
      <div class="row-main">
        <strong>${displayName(u)}</strong>
        <div class="muted">${u.email}</div>
      </div>
    `;

    /* Payment status */
    const payment = document.createElement("select");
    ["unpaid", "paid", "comped"].forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      if ((m.payment_status || "unpaid") === v) o.selected = true;
      payment.appendChild(o);
    });

    payment.onchange = async () => {
      const { error } = await supabase
        .from("league_members")
        .update({ payment_status: payment.value })
        .eq("id", m.id);

      if (error) {
        showError("Payment update failed", error);
      }
    };

    /* Ban toggle */
    const banned = document.createElement("input");
    banned.type = "checkbox";
    banned.checked = !!m.banned;

    banned.onchange = async () => {
      const { error } = await supabase
        .from("league_members")
        .update({ banned: banned.checked })
        .eq("id", m.id);

      if (error) {
        showError("Ban update failed", error);
      }
    };

    /* Remove */
    const remove = document.createElement("button");
    remove.className = "btn danger";
    remove.textContent = "Remove";

    remove.onclick = async () => {
      if (!confirm("Remove from league?")) return;

      const { error } = await supabase
        .from("league_members")
        .delete()
        .eq("id", m.id);

      if (error) {
        showError("Remove failed", error);
        return;
      }

      loadLeague();
    };

    const controls = document.createElement("div");
    controls.className = "controls";
    controls.append(payment, banned, remove);

    row.appendChild(controls);
    leagueList.appendChild(row);
  }
}

/* -------------------------------------------------------
   INIT (Auth-Stable)
-------------------------------------------------------- */

async function init() {

  const session = await window.auth.getSession();

  if (!session) {
    notLogged.classList.remove("hidden");
    return;
  }

  const profile = await getProfile();

  if (!profile) {
    notLogged.classList.remove("hidden");
    return;
  }

  if (!profile.is_mod) {
    notAdmin.classList.remove("hidden");
    return;
  }

  adminPanel.classList.remove("hidden");

  await loadUsers();
  await loadLeague();
}

document.addEventListener("DOMContentLoaded", init);