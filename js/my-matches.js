// /js/my-matches.js
//
// Player-facing display of:
// - Scheduled matches (not reported)
// - Pending (reported, awaiting approval)
// - Completed (approved)
// - History (previous months)
//
// Works with league_matches schema.
//
// A "scheduled" match is a match in the current month where:
// - player_a = me OR player_b = me
// - approved = false
// - winner = null
// - player_b != null (skip BYEs — they already auto-win)

import { supabase } from "/js/supabase.js";
import { getLocalSession } from "/js/session.js";
import { isDrawMatch } from "/js/standings-utils.js";  // reuse draw logic

const playerLabelEl = document.getElementById("player-label");
const monthLabelEl = document.getElementById("month-label");
const loadErrorEl = document.getElementById("load-error");

const scheduledList = document.getElementById("scheduled-list");
const pendingList = document.getElementById("pending-list");
const completedList = document.getElementById("completed-list");
const historyList = document.getElementById("history-list");

let currentPlayer = null;
let currentMonth = null;
let podsById = {};
let opponentsById = {};

async function ensureLoggedIn() {
  const sess = getLocalSession();
  if (!sess || !sess.playerId) {
    window.location.href = "/login.html";
    return null;
  }

  const { data, error } = await supabase
    .from("players")
    .select("id, full_name")
    .eq("id", sess.playerId)
    .single();

  if (error || !data) throw error;

  currentPlayer = data;
  playerLabelEl.textContent = `Logged in as ${data.full_name}`;
}

async function findCurrentMonth() {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("league_months")
    .select("id, name, season_id, start_date, end_date")
    .lte("start_date", today)
    .gte("end_date", today)
    .limit(1);

  if (error) throw error;
  if (!data?.length) throw new Error("No active league month.");

  return data[0];
}

async function loadPodsForMonth(monthId) {
  const { data, error } = await supabase
    .from("pods")
    .select("id, name")
    .eq("month_id", monthId);

  if (error) throw error;

  const map = {};
  for (const p of data || []) map[p.id] = p;
  return map;
}

async function loadAllLeagueMatches(playerId) {
  const { data, error } = await supabase
    .from("league_matches")
    .select("*");

  if (error) throw error;

  return data.filter(
    (m) => m.player_a === playerId || m.player_b === playerId
  );
}

async function loadOpponents(matchList) {
  const ids = new Set();
  for (const m of matchList) {
    if (m.player_a && m.player_a !== currentPlayer.id) ids.add(m.player_a);
    if (m.player_b && m.player_b !== currentPlayer.id) ids.add(m.player_b);
  }
  if (!ids.size) return {};

  const { data, error } = await supabase
    .from("players")
    .select("id, full_name")
    .in("id", [...ids]);

  if (error) throw error;

  const map = {};
  for (const p of data || []) map[p.id] = p;
  return map;
}

function opponentOf(match) {
  if (match.player_a === currentPlayer.id) return match.player_b;
  return match.player_a;
}

function renderMatchCard(match, sectionEl, type) {
  const oppId = opponentOf(match);
  const oppName = opponentsById[oppId]?.full_name || "(unknown opponent)";
  const podName = podsById[match.pod_id]?.name || "Unknown Pod";

  const card = document.createElement("div");
  card.className = "border rounded-lg p-3 bg-slate-50 shadow-sm text-sm";

  const heading = document.createElement("div");
  heading.className = "flex justify-between items-center";

  const title = document.createElement("span");
  title.innerHTML = `<strong>${oppName}</strong> — <span class="text-xs">${podName}</span>`;
  heading.appendChild(title);

  // status pill
  const status = document.createElement("span");
  status.className =
    "text-xs px-2 py-0.5 rounded-full border border-slate-300 bg-white";
  if (type === "scheduled") status.textContent = "Not Reported";
  if (type === "pending") status.textContent = "Pending";
  if (type === "completed") status.textContent = "Final";
  if (type === "history") status.textContent = match.month_id ? "" : "";
  heading.appendChild(status);

  card.appendChild(heading);

  // result line (pending/completed/history only)
  if (type !== "scheduled") {
    const line = document.createElement("p");
    line.className = "text-xs text-slate-600 mt-1";

    if (isDrawMatch(match)) {
      line.textContent = "Result: Draw";
    } else if (match.winner === currentPlayer.id) {
      line.textContent = "Result: Win";
    } else if (match.winner && match.winner !== currentPlayer.id) {
      line.textContent = "Result: Loss";
    } else {
      line.textContent = "Result: Unknown";
    }

    card.appendChild(line);
  }

  // notes
  if (match.notes) {
    const n = document.createElement("p");
    n.className = "text-[11px] text-slate-500 mt-1";
    n.textContent = `Notes: ${match.notes}`;
    card.appendChild(n);
  }

  // link to report
  if (type === "scheduled") {
    const btn = document.createElement("a");
    btn.href = "/report-match.html";
    btn.className =
      "inline-block mt-2 bg-sky-600 hover:bg-sky-700 text-white text-xs px-3 py-1 rounded";
    btn.textContent = "Report Match";
    card.appendChild(btn);
  }

  sectionEl.appendChild(card);
}

function renderLists(allMatches) {
  scheduledList.innerHTML = "";
  pendingList.innerHTML = "";
  completedList.innerHTML = "";
  historyList.innerHTML = "";

  for (const m of allMatches) {
    const isCurrent = m.month_id === currentMonth.id;

    // classify:
    if (isCurrent) {
      if (!m.approved) {
        if (!m.winner && m.player_b !== null) {
          renderMatchCard(m, scheduledList, "scheduled");
        } else {
          renderMatchCard(m, pendingList, "pending");
        }
      } else {
        renderMatchCard(m, completedList, "completed");
      }
    } else {
      if (m.approved) {
        renderMatchCard(m, historyList, "history");
      }
    }
  }
}

async function init() {
  try {
    await ensureLoggedIn();
    currentMonth = await findCurrentMonth();

    monthLabelEl.textContent =
      `Month: ${currentMonth.name} (${currentMonth.start_date} → ${currentMonth.end_date})`;

    podsById = await loadPodsForMonth(currentMonth.id);

    const allMatches = await loadAllLeagueMatches(currentPlayer.id);
    opponentsById = await loadOpponents(allMatches);

    renderLists(allMatches);
  } catch (err) {
    console.error(err);
    loadErrorEl.textContent = err.message || "Error loading matches.";
    loadErrorEl.classList.remove("hidden");
  }
}

init();
