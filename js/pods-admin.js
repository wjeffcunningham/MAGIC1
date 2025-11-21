// /js/pods-admin.js
// Admin pod management: view/edit pods, random seed, rating seed, save.
//
// Works with:
//   league_months  (id, name, season_id, start_date)
//   league_signups (season_id, player_id, status='active')
//   players        (id, full_name, username, league_rating)
//   pods           (id, month_id, name, max_players)
//   pod_members    (id, pod_id, player_id)
//
// Assumes admin-guard has already run in the HTML.

import { supabase } from "./supabase.js";

const monthSelect   = document.getElementById("month-select");
const podsGrid      = document.getElementById("pods-grid");
const statusEl      = document.getElementById("pods-status");
const errorEl       = document.getElementById("pods-error");
const successEl     = document.getElementById("pods-success");

const btnRandom     = document.getElementById("btn-random-seed");
const btnRating     = document.getElementById("btn-rating-seed");
const btnSave       = document.getElementById("btn-save");
const btnReload     = document.getElementById("btn-reload");

// In-memory state
let months = [];          // [{id, name, season_id, start_date}]
let currentMonth = null;  // {id, name, season_id, ...}
let pods = [];            // [{id, name, max_players}]
let activePlayers = [];   // [{id, full_name, username, league_rating}]
let podAssignments = {};  // podId -> [playerId,...]
let unassigned = [];      // [playerId,...]

// ------- helpers -------

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function clearError() {
  errorEl.classList.add("hidden");
}

function showSuccess(msg) {
  successEl.textContent = msg;
  successEl.classList.remove("hidden");
}

function clearSuccess() {
  successEl.classList.add("hidden");
}

function shuffleArray(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function playerById(id) {
  return activePlayers.find(p => p.id === id);
}

// ------- load months -------

async function loadMonths() {
  clearError();
  statusEl.textContent = "Loading months…";

  const { data, error } = await supabase
    .from("league_months")
    .select("id, name, season_id, start_date")
    .order("start_date");

  if (error) {
    console.error(error);
    showError("Error loading months.");
    statusEl.textContent = "Error.";
    return;
  }

  months = data || [];

  monthSelect.innerHTML = months
    .map(m => `<option value="${m.id}">${m.name}</option>`)
    .join("");

  if (!months.length) {
    statusEl.textContent = "No league months defined.";
    return;
  }

  // Default = first month
  const first = months[0];
  currentMonth = first;
  monthSelect.value = first.id;

  await loadPodsAndPlayers(first.id);
}

monthSelect.addEventListener("change", async (e) => {
  const id = e.target.value;
  currentMonth = months.find(m => m.id === id) || null;
  if (!currentMonth) return;
  await loadPodsAndPlayers(currentMonth.id);
});

// ------- load pods + players -------

async function ensurePodsExistForMonth(monthId) {
  // Fetch pods for this month
  const { data: existing, error } = await supabase
    .from("pods")
    .select("id, name, max_players")
    .eq("month_id", monthId)
    .order("name");

  if (error) {
    console.error(error);
    throw new Error("Error loading pods.");
  }

  if (existing && existing.length > 0) {
    return existing;
  }

  // If none, auto-create Pod A–D with max_players = 8
  const { data: inserted, error: insErr } = await supabase
    .from("pods")
    .insert([
      { month_id: monthId, name: "Pod A", max_players: 8 },
      { month_id: monthId, name: "Pod B", max_players: 8 },
      { month_id: monthId, name: "Pod C", max_players: 8 },
      { month_id: monthId, name: "Pod D", max_players: 8 },
    ])
    .select("*")
    .order("name");

  if (insErr) {
    console.error(insErr);
    throw new Error("Error creating pods for this month.");
  }

  return inserted;
}

async function loadPodsAndPlayers(monthId) {
  clearError();
  clearSuccess();
  statusEl.textContent = "Loading pods and players…";
  podsGrid.innerHTML = "";

  try {
    // 1) Pods
    const podRows = await ensurePodsExistForMonth(monthId);
    pods = podRows;

    const podIds = pods.map(p => p.id);

    // 2) Existing pod members (with player info)
    const { data: members, error: memErr } = await supabase
      .from("pod_members")
      .select(`
        pod_id,
        players:player_id (
          id,
          full_name,
          username,
          league_rating
        )
      `)
      .in("pod_id", podIds);

    if (memErr) {
      console.error(memErr);
      throw new Error("Error loading pod members.");
    }

    // 3) Active signups for this month’s season
    const seasonId = currentMonth?.season_id;
    if (!seasonId) {
      throw new Error("Month has no season_id.");
    }

    const { data: signups, error: suErr } = await supabase
      .from("league_signups")
      .select(`
        player_id,
        status,
        players:player_id (
          id,
          full_name,
          username,
          league_rating
        )
      `)
      .eq("season_id", seasonId)
      .eq("status", "active");

    if (suErr) {
      console.error(suErr);
      throw new Error("Error loading active league signups.");
    }

    // Flatten activePlayers list
    const playersMap = new Map();
    (signups || []).forEach(s => {
      if (s.players) {
        playersMap.set(s.players.id, s.players);
      }
    });

    activePlayers = Array.from(playersMap.values());

    // 4) Build podAssignments + unassigned from members
    podAssignments = {};
    pods.forEach(p => {
      podAssignments[p.id] = [];
    });

    const assignedSet = new Set();

    (members || []).forEach(m => {
      const p = m.players;
      if (!p) return;
      if (!podAssignments[m.pod_id]) {
        podAssignments[m.pod_id] = [];
      }
      podAssignments[m.pod_id].push(p.id);
      assignedSet.add(p.id);
    });

    unassigned = activePlayers
      .map(p => p.id)
      .filter(id => !assignedSet.has(id));

    renderPodsUI();
    statusEl.textContent = "Pods loaded.";
  } catch (e) {
    console.error(e);
    showError(e.message || "Error loading pods/players.");
    statusEl.textContent = "Error.";
  }
}

// ------- UI render -------

function renderPodsUI() {
  podsGrid.innerHTML = "";

  // Column: Unassigned
  const unassignedCol = document.createElement("div");
  unassignedCol.className = "bg-slate-50 border rounded-xl p-3 flex flex-col";
  unassignedCol.innerHTML = `
    <div class="font-semibold text-sm mb-2">Unassigned</div>
    <div class="text-xs text-slate-500 mb-2">
      Players not currently in any pod.
    </div>
    <div class="space-y-1 min-h-[40px]" data-pod-id="unassigned"></div>
  `;

  const uaList = unassignedCol.querySelector("[data-pod-id='unassigned']");
  uaList.classList.add("dropzone");
  unassigned.forEach(pid => {
    const p = playerById(pid);
    if (!p) return;
    uaList.appendChild(playerChip(p));
  });

  podsGrid.appendChild(unassignedCol);

  // Columns: Pods
  pods.forEach(pod => {
    const col = document.createElement("div");
    col.className = "bg-white border rounded-xl p-3 flex flex-col";

    const max = pod.max_players ?? 8;
    const assignedIds = podAssignments[pod.id] || [];

    col.innerHTML = `
      <div class="font-semibold text-sm mb-1">${pod.name}</div>
      <div class="text-xs text-slate-500 mb-2">
        ${assignedIds.length}/${max} players
      </div>
      <div class="space-y-1 min-h-[40px]" data-pod-id="${pod.id}"></div>
    `;

    const list = col.querySelector("[data-pod-id]");
    list.classList.add("dropzone");

    assignedIds
      .map(id => playerById(id))
      .filter(Boolean)
      .sort((a, b) =>
        (a.full_name || "").localeCompare(b.full_name || "")
      )
      .forEach(p => {
        list.appendChild(playerChip(p));
      });

    podsGrid.appendChild(col);
  });

  // Rebind drag/drop after rendering
  bindDragAndDrop();
}

function playerChip(p) {
  const div = document.createElement("div");
  div.className =
    "player-chip cursor-move bg-slate-100 border rounded px-2 py-1 text-xs flex justify-between items-center";
  div.draggable = true;
  div.dataset.playerId = p.id;

  div.innerHTML = `
    <span>
      ${p.full_name}
      ${
        p.username
          ? `<span class="text-[10px] text-slate-500">(${p.username})</span>`
          : ""
      }
    </span>
    <span class="text-[10px] text-slate-500 ml-2">L:${p.league_rating}</span>
  `;

  return div;
}

// ------- drag & drop -------

function bindDragAndDrop() {
  const chips = podsGrid.querySelectorAll(".player-chip");
  const zones = podsGrid.querySelectorAll(".dropzone");

  chips.forEach(chip => {
    chip.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", chip.dataset.playerId);
      e.dataTransfer.effectAllowed = "move";
    });
  });

  zones.forEach(zone => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      zone.classList.add("ring-2", "ring-sky-400");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("ring-2", "ring-sky-400");
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("ring-2", "ring-sky-400");
      const playerId = e.dataTransfer.getData("text/plain");
      if (!playerId) return;

      // Move DOM element
      const chip = podsGrid.querySelector(
        `.player-chip[data-player-id="${playerId}"]`
      );
      if (!chip) return;

      // Remove from old parent
      if (chip.parentElement) {
        chip.parentElement.removeChild(chip);
      }

      zone.appendChild(chip);

      // Update in-memory assignments
      syncAssignmentsFromDOM();
      renderPodsUI(); // re-render counts etc
    });
  });
}

// Rebuild podAssignments + unassigned from DOM structure
function syncAssignmentsFromDOM() {
  const zones = podsGrid.querySelectorAll(".dropzone");

  // Reset
  pods.forEach(p => {
    podAssignments[p.id] = [];
  });
  unassigned = [];

  zones.forEach(zone => {
    const pidAttr = zone.getAttribute("data-pod-id");
    const chips = zone.querySelectorAll(".player-chip");
    const ids = Array.from(chips).map(c => c.dataset.playerId);

    if (pidAttr === "unassigned") {
      unassigned = ids;
    } else {
      if (!podAssignments[pidAttr]) podAssignments[pidAttr] = [];
      podAssignments[pidAttr] = ids;
    }
  });
}

// ------- seeding -------

function seedRandom() {
  clearSuccess();
  clearError();

  if (!activePlayers.length) {
    showError("No active players to seed.");
    return;
  }

  const maxPerPod = pods[0]?.max_players || 8;
  const shuffled = shuffleArray(activePlayers.map(p => p.id));

  // Clear all
  pods.forEach(p => {
    podAssignments[p.id] = [];
  });
  unassigned = [];

  shuffled.forEach((pid, idx) => {
    const podIndex = Math.floor(idx / maxPerPod);
    if (podIndex < pods.length) {
      const podId = pods[podIndex].id;
      podAssignments[podId].push(pid);
    } else {
      unassigned.push(pid);
    }
  });

  renderPodsUI();
  statusEl.textContent = "Random seed applied (not yet saved).";
}

function seedByRating() {
  clearSuccess();
  clearError();

  if (!activePlayers.length) {
    showError("No active players to seed.");
    return;
  }

  const maxPerPod = pods[0]?.max_players || 8;

  const sorted = activePlayers
    .slice()
    .sort((a, b) => (b.league_rating || 0) - (a.league_rating || 0));

  pods.forEach(p => {
    podAssignments[p.id] = [];
  });
  unassigned = [];

  sorted.forEach((p, idx) => {
    const podIndex = Math.floor(idx / maxPerPod);
    if (podIndex < pods.length) {
      const podId = pods[podIndex].id;
      podAssignments[podId].push(p.id);
    } else {
      unassigned.push(p.id);
    }
  });

  renderPodsUI();
  statusEl.textContent = "Rating-based seed applied (not yet saved).";
}

// ------- save to DB -------

async function savePods() {
  clearError();
  clearSuccess();

  if (!currentMonth) {
    showError("No month selected.");
    return;
  }

  statusEl.textContent = "Saving pod assignments…";

  // Build rows for pod_members
  const rows = [];
  pods.forEach(pod => {
    const ids = podAssignments[pod.id] || [];
    ids.forEach(pid => {
      rows.push({
        pod_id: pod.id,
        player_id: pid,
      });
    });
  });

  const podIds = pods.map(p => p.id);

  // Delete existing rows for these pods, then insert new ones
  const { error: delErr } = await supabase
    .from("pod_members")
    .delete()
    .in("pod_id", podIds);

  if (delErr) {
    console.error(delErr);
    showError("Error clearing existing pod assignments.");
    statusEl.textContent = "Error.";
    return;
  }

  if (rows.length) {
    const { error: insErr } = await supabase
      .from("pod_members")
      .insert(rows);

    if (insErr) {
      console.error(insErr);
      showError("Error saving pod assignments.");
      statusEl.textContent = "Error.";
      return;
    }
  }

  showSuccess("Pod assignments saved.");
  statusEl.textContent = "Saved.";
}

// ------- button handlers -------

btnRandom.addEventListener("click", seedRandom);
btnRating.addEventListener("click", seedByRating);
btnSave.addEventListener("click", savePods);
btnReload.addEventListener("click", () => {
  if (currentMonth) loadPodsAndPlayers(currentMonth.id);
});

// Kick things off
loadMonths();