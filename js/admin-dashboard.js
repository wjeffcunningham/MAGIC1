// /js/admin-dashboard.js

import { supabase } from "./config.js";
import { getProfile, CURRENT_SEASON } from "./db.js";
import {
  syncPlayersFromLeagueMembers,
  importLeagueRoundFromCSVText,
  generateAndSaveMonthPairingsDraft,
  finalizeMonthPairings
} from "./admin-league-tools.js";

/* -------------------------------------------------------
   DOM
-------------------------------------------------------- */

const notLogged  = document.getElementById("not-logged");
const notAdmin   = document.getElementById("not-admin");
const adminPanel = document.getElementById("admin-panel");

const usersCount = document.getElementById("users-count");
const usersList  = document.getElementById("users-list");

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

/* -------------------------------------------------------
   USERS (global, magic1)
-------------------------------------------------------- */

async function loadUsers() {
  clearNode(usersList);

  const { data: users } = await supabase
    .from("site_users")
    .select("id,email,handle,moderated_handle")
    .order("created_at");

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
      await supabase
        .from("site_users")
        .update({ moderated_handle: input.value.trim() || null })
        .eq("id", u.id);
    };

    const controls = document.createElement("div");
    controls.className = "controls";
    controls.append(input, save);

    row.appendChild(controls);
    usersList.appendChild(row);
  });
}

/* -------------------------------------------------------
   LEAGUE MEMBERS (current season)
-------------------------------------------------------- */

async function loadLeague() {
  clearNode(leagueList);

  const { data: members } = await supabase
    .from("league_members")
    .select("id,user_id,payment_status,confirmed,banned")
    .eq("season", CURRENT_SEASON);

  leagueCount.textContent = `${members.length} members.`;

  for (const m of members) {
    const { data: u } = await supabase
      .from("site_users")
      .select("email,handle,moderated_handle")
      .eq("id", m.user_id)
      .single();

    const row = document.createElement("div");
    row.className = "row";

    row.innerHTML = `
      <div class="row-main">
        <strong>${displayName(u)}</strong>
        <div class="muted">${u.email}</div>
      </div>
    `;

    const payment = document.createElement("select");
    ["unpaid","paid","comped"].forEach(v=>{
      const o=document.createElement("option");
      o.value=v; o.textContent=v;
      if ((m.payment_status||"unpaid") === v) o.selected=true;
      payment.appendChild(o);
    });
    payment.onchange = () =>
      supabase.from("league_members")
        .update({ payment_status: payment.value })
        .eq("id", m.id);

    const banned = document.createElement("input");
    banned.type = "checkbox";
    banned.checked = !!m.banned;
    banned.onchange = () =>
      supabase.from("league_members")
        .update({ banned: banned.checked })
        .eq("id", m.id);

    const remove = document.createElement("button");
    remove.className = "btn danger";
    remove.textContent = "Remove";
    remove.onclick = async () => {
      if (confirm("Remove from league?")) {
        await supabase.from("league_members").delete().eq("id", m.id);
        loadLeague();
      }
    };

    const controls = document.createElement("div");
    controls.className = "controls";
    controls.append(payment, banned, remove);

    row.appendChild(controls);
    leagueList.appendChild(row);
  }
}

/* -------------------------------------------------------
   OPS
-------------------------------------------------------- */

function wireOps() {
  document.getElementById("btn-sync-players").onclick = async () => {
    const s=document.getElementById("sync-status");
    s.textContent="Syncing…";
    const r=await syncPlayersFromLeagueMembers();
    s.textContent=`Created ${r.created}, skipped ${r.skipped}`;
  };

  document.getElementById("btn-import-round").onclick = async () => {
    const s=document.getElementById("round-status");
    s.textContent="Importing…";
    const round=+document.getElementById("round-number").value;
    const f=document.getElementById("round-csv").files[0];
    const csv=await f.text();
    await importLeagueRoundFromCSVText({ round, csvText: csv });
    s.textContent="Imported.";
  };

  document.getElementById("btn-generate-pairings").onclick = async () => {
    const s=document.getElementById("pairings-status");
    s.textContent="Generating…";
    const y=+document.getElementById("pairings-year").value;
    const m=+document.getElementById("pairings-month").value;
    const p=document.getElementById("pairings-use-pools").checked;
    await generateAndSaveMonthPairingsDraft({ leagueYear:y, monthIndex:m, usePools:p });
    s.textContent="Draft generated.";
  };

  document.getElementById("btn-finalize-pairings").onclick = async () => {
    const s=document.getElementById("pairings-status");
    const m=+document.getElementById("pairings-month").value;
    await finalizeMonthPairings({ monthIndex:m });
    s.textContent="Finalized.";
  };
}

/* -------------------------------------------------------
   INIT
-------------------------------------------------------- */

async function init() {
  const p = await getProfile();
  if (!p) { notLogged.classList.remove("hidden"); return; }
  if (!p.is_mod) { notAdmin.classList.remove("hidden"); return; }

  adminPanel.classList.remove("hidden");
  await loadUsers();
  await loadLeague();
  wireOps();
}

document.addEventListener("DOMContentLoaded", init);