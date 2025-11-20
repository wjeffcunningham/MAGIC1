import { supabase } from "./supabase.js";

const monthSelect = document.getElementById("month-select");
const container = document.getElementById("pods-container");
const errEl = document.getElementById("pods-error");

let currentMonthId = null;
let podsForMonth = []; // {id, name}
let playersById = {};  // player_id -> {id, full_name, username}
let membershipByPod = {}; // pod_id -> [player_id]
let unassigned = []; // [player_id]

async function init() {
  errEl.classList.add("hidden");

  // Load months
  const { data: months, error: mErr } = await supabase
    .from("league_months")
    .select("id, name, month_index")
    .order("month_index");

  if (mErr) {
    errEl.textContent = "Error loading months.";
    errEl.classList.remove("hidden");
    return;
  }

  monthSelect.innerHTML = "";
  for (const m of months) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    monthSelect.appendChild(opt);
  }

  if (months.length > 0) {
    currentMonthId = months[0].id;
    monthSelect.value = currentMonthId;
    await loadMonth(currentMonthId);
  }

  monthSelect.addEventListener("change", async () => {
    currentMonthId = monthSelect.value;
    await loadMonth(currentMonthId);
  });
}

async function loadMonth(monthId) {
  errEl.classList.add("hidden");
  container.innerHTML = "Loading…";

  // Load pods for this month
  const { data: pods, error: pErr } = await supabase
    .from("pods")
    .select("id, name")
    .eq("month_id", monthId)
    .order("name");

  if (pErr) {
    errEl.textContent = "Error loading pods.";
    errEl.classList.remove("hidden");
    return;
  }

  podsForMonth = pods || [];

  // Load pod_members for these pods
  const podIds = podsForMonth.map(p => p.id);
  const { data: members, error: memErr } = await supabase
    .from("pod_members")
    .select("pod_id, player_id")
    .in("pod_id", podIds);

  if (memErr) {
    errEl.textContent = "Error loading pod members.";
    errEl.classList.remove("hidden");
    return;
  }

  membershipByPod = {};
  for (const p of podsForMonth) membershipByPod[p.id] = [];
  for (const m of (members || [])) {
    membershipByPod[m.pod_id].push(m.player_id);
  }

  // Load all league_signups for this season/month's season (roughly: all active players)
  // For simplicity, load all players table; league filtering can be added later.
  const { data: players, error: plErr } = await supabase
    .from("players")
    .select("id, full_name, username")
    .order("full_name");

  if (plErr) {
    errEl.textContent = "Error loading players.";
    errEl.classList.remove("hidden");
    return;
  }

  playersById = {};
  for (const p of players) {
    playersById[p.id] = p;
  }

  // Compute unassigned: all players minus those in any pod
  const assignedSet = new Set();
  for (const podId of Object.keys(membershipByPod)) {
    for (const pid of membershipByPod[podId]) {
      assignedSet.add(pid);
    }
  }

  unassigned = [];
  for (const p of players) {
    if (!assignedSet.has(p.id)) {
      unassigned.push(p.id);
    }
  }

  render();
}

function render() {
  container.innerHTML = "";

  // Unassigned column
  const unCol = createColumn("Unassigned", "unassigned");
  for (const pid of unassigned) {
    const el = createPlayerChip(pid);
    unCol.querySelector(".pod-body").appendChild(el);
  }
  container.appendChild(unCol);

  // Pod columns
  for (const pod of podsForMonth) {
    const podCol = createColumn(pod.name, pod.id);
    for (const pid of membershipByPod[pod.id]) {
      const el = createPlayerChip(pid);
      podCol.querySelector(".pod-body").appendChild(el);
    }
    container.appendChild(podCol);
  }
}

function createColumn(title, podIdOrUnassigned) {
  const col = document.createElement("div");
  col.className = "bg-white rounded-xl shadow p-3 flex flex-col";
  col.dataset.dropTarget = podIdOrUnassigned;

  col.innerHTML = `
    <div class="font-semibold text-sm mb-2 text-center">${title}</div>
    <div class="pod-body flex-1 min-h-[60px] border border-dashed border-slate-300 rounded p-2 space-y-1 overflow-y-auto"></div>
  `;

  const body = col.querySelector(".pod-body");

  // Drag-over
  body.addEventListener("dragover", (e) => {
    e.preventDefault();
    body.classList.add("bg-slate-50");
  });
  body.addEventListener("dragleave", () => {
    body.classList.remove("bg-slate-50");
  });
  body.addEventListener("drop", async (e) => {
    e.preventDefault();
    body.classList.remove("bg-slate-50");
    const playerId = e.dataTransfer.getData("text/plain");
    if (!playerId) return;
    await handleDrop(playerId, podIdOrUnassigned);
  });

  return col;
}

function createPlayerChip(playerId) {
  const p = playersById[playerId];
  const el = document.createElement("div");
  el.className =
    "text-xs bg-slate-100 border border-slate-300 rounded px-2 py-1 cursor-move";
  el.draggable = true;
  el.dataset.playerId = playerId;
  el.textContent = p.full_name + (p.username ? ` (${p.username})` : "");

  el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", playerId);
  });

  return el;
}

async function handleDrop(playerId, target) {
  errEl.classList.add("hidden");

  if (target === "unassigned") {
    // Remove from any pod for this month
    const podIds = podsForMonth.map(p => p.id);
    const { error } = await supabase
      .from("pod_members")
      .delete()
      .eq("player_id", playerId)
      .in("pod_id", podIds);

    if (error) {
      errEl.textContent = "Error removing player from pod.";
      errEl.classList.remove("hidden");
      return;
    }
  } else {
    // Move player into target pod; remove from others for this month
    const podIds = podsForMonth.map(p => p.id);
    const { error: delErr } = await supabase
      .from("pod_members")
      .delete()
      .eq("player_id", playerId)
      .in("pod_id", podIds);

    if (delErr) {
      errEl.textContent = "Error moving player between pods.";
      errEl.classList.remove("hidden");
      return;
    }

    const { error: insErr } = await supabase.from("pod_members").insert({
      pod_id: target,
      player_id: playerId,
    });

    if (insErr) {
      errEl.textContent = "Error assigning player to pod.";
      errEl.classList.remove("hidden");
      return;
    }
  }

  // reload month data for accurate state
  await loadMonth(currentMonthId);
}

init();