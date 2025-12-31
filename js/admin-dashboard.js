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

import {
  syncPlayersFromLeagueMembers,
  importLeagueRoundFromCSVText,
  importMonthStandingsFromCSVText,
  generateAndSaveMonthPairingsDraft,
  finalizeMonthPairings,
  importExternalTournament
} from "./admin-league-tools.js";

/* -------------------------------------------------------
   DOM
-------------------------------------------------------- */

const notLogged  = document.getElementById("not-logged");
const notAdmin   = document.getElementById("not-admin");
const adminPanel = document.getElementById("admin-panel");

const pendingCount = document.getElementById("pending-count");
const pendingList  = document.getElementById("pending-list");

const usersCount = document.getElementById("users-count");
const usersList  = document.getElementById("users-list");

const leagueCount = document.getElementById("league-count");
const leagueList  = document.getElementById("league-list");

/* -------------------------------------------------------
   Helpers
-------------------------------------------------------- */

function clearNode(n) { while (n?.firstChild) n.removeChild(n.firstChild); }

function nameForUser(u) {
  return u.moderated_handle || u.handle || u.email;
}

function readFileAsText(input) {
  return new Promise((resolve, reject) => {
    const f = input?.files?.[0];
    if (!f) return reject(new Error("No file selected."));
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Read failed."));
    r.readAsText(f);
  });
}

/* -------------------------------------------------------
   Pending Users
-------------------------------------------------------- */

async function loadPending() {
  clearNode(pendingList);
  pendingList.textContent = "Loading…";

  const { data } = await supabase
    .from("site_users")
    .select("id,email,handle,created_at")
    .eq("status","pending")
    .order("created_at");

  if (!data?.length) {
    pendingList.textContent = "No pending sign-ups.";
    pendingCount.textContent = "0 pending.";
    return;
  }

  pendingCount.textContent = `${data.length} pending.`;

  data.forEach(u => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="row-main">
        <strong>${u.email}</strong>
        <div class="small-muted">${new Date(u.created_at).toLocaleString()}</div>
      </div>
    `;

    const controls = document.createElement("div");
    controls.className = "controls";

    const approve = document.createElement("button");
    approve.className = "btn primary";
    approve.textContent = "Approve";
    approve.onclick = async () => {
      await approveUser(u.id);
      await loadPending(); await loadUsers(); await loadLeague();
    };

    const reject = document.createElement("button");
    reject.className = "btn";
    reject.textContent = "Reject";
    reject.onclick = async () => {
      await rejectUser(u.id);
      await loadPending();
    };

    controls.append(approve, reject);
    row.appendChild(controls);
    pendingList.appendChild(row);
  });
}

/* -------------------------------------------------------
   Users
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
        <strong>${nameForUser(u)}</strong>
        <div class="small-muted">${u.email}</div>
      </div>
    `;

    const input = document.createElement("input");
    input.className = "handle-input";
    input.value = u.moderated_handle || u.handle || "";

    const save = document.createElement("button");
    save.className = "btn";
    save.textContent = "Save";
    save.onclick = () => overrideHandle(u.id, input.value.trim() || null);

    const c = document.createElement("div");
    c.className = "controls";
    c.append(input, save);

    row.appendChild(c);
    usersList.appendChild(row);
  });
}

/* -------------------------------------------------------
   League Members
-------------------------------------------------------- */

async function loadLeague() {
  clearNode(leagueList);

  const { data: members } = await supabase
    .from("league_members")
    .select("id,user_id,payment_status,confirmed")
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
        <strong>${nameForUser(u)}</strong>
        <div class="small-muted">${u.email}</div>
      </div>
    `;

    const pay = document.createElement("select");
    ["unpaid","paid","comped"].forEach(v=>{
      const o=document.createElement("option");
      o.value=v;o.textContent=v;
      if((m.payment_status||"unpaid")===v)o.selected=true;
      pay.appendChild(o);
    });
    pay.onchange=()=>setLeaguePaymentStatus(m.id,pay.value);

    const conf = document.createElement("input");
    conf.type="checkbox";
    conf.checked=!!m.confirmed;
    conf.onchange=()=>setLeagueConfirmed(m.id,conf.checked);

    const rem=document.createElement("button");
    rem.className="btn danger";
    rem.textContent="Remove";
    rem.onclick=async()=>{
      if(confirm("Remove?")){
        await removeLeagueMemberRow(m.id);
        loadLeague();
      }
    };

    const c=document.createElement("div");
    c.className="controls";
    c.append(pay,conf,rem);

    row.appendChild(c);
    leagueList.appendChild(row);
  }
}

/* -------------------------------------------------------
   League Ops + External
-------------------------------------------------------- */

function wireOps() {

  document.getElementById("btn-sync-players").onclick = async () => {
    const s=document.getElementById("sync-status");
    s.textContent="Syncing…";
    try {
      const r=await syncPlayersFromLeagueMembers();
      s.textContent=`Created ${r.created}, skipped ${r.skipped}`;
    } catch(e){ s.textContent=e.message; }
  };

  document.getElementById("btn-import-round").onclick = async () => {
    const s=document.getElementById("round-status");
    s.textContent="Importing…";
    try {
      const round=+document.getElementById("round-number").value;
      const csv=await readFileAsText(document.getElementById("round-csv"));
      await importLeagueRoundFromCSVText({ round, csvText:csv });
      s.textContent="Imported.";
    } catch(e){ s.textContent=e.message; }
  };

  document.getElementById("btn-import-standings").onclick = async () => {
    const s=document.getElementById("standings-status");
    s.textContent="Importing…";
    try {
      const y=+document.getElementById("standings-year").value;
      const m=+document.getElementById("standings-month").value;
      const csv=await readFileAsText(document.getElementById("standings-csv"));
      await importMonthStandingsFromCSVText({ leagueYear:y, monthIndex:m, csvText:csv });
      s.textContent="Imported.";
    } catch(e){ s.textContent=e.message; }
  };

  document.getElementById("btn-generate-pairings").onclick = async () => {
    const s=document.getElementById("pairings-status");
    s.textContent="Generating…";
    try {
      const y=+document.getElementById("pairings-year").value;
      const m=+document.getElementById("pairings-month").value;
      const p=document.getElementById("pairings-use-pools").checked;
      await generateAndSaveMonthPairingsDraft({ leagueYear:y, monthIndex:m, usePools:p });
      s.textContent="Draft generated.";
    } catch(e){ s.textContent=e.message; }
  };

  document.getElementById("btn-finalize-pairings").onclick = async () => {
    const s=document.getElementById("pairings-status");
    try {
      const m=+document.getElementById("pairings-month").value;
      await finalizeMonthPairings({ monthIndex:m });
      s.textContent="Finalized.";
    } catch(e){ s.textContent=e.message; }
  };

  document.getElementById("btn-import-external").onclick = async () => {
    const s=document.getElementById("ext-status");
    s.textContent="Importing…";
    try {
      const name=document.getElementById("ext-event-name").value;
      const k=+document.getElementById("ext-k").value;
      const csv=await readFileAsText(document.getElementById("ext-csv"));
      await importExternalTournament({ eventName:name, kValue:k, csvText:csv });
      s.textContent="External imported.";
    } catch(e){ s.textContent=e.message; }
  };
}

/* -------------------------------------------------------
   Init
-------------------------------------------------------- */

async function init() {
  const p=await getProfile();
  if(!p){notLogged.classList.remove("hidden");return;}
  if(!p.is_mod){notAdmin.classList.remove("hidden");return;}

  adminPanel.classList.remove("hidden");
  await loadPending(); await loadUsers(); await loadLeague();
  wireOps();
}

document.addEventListener("DOMContentLoaded", init);