// /js/league-standings.js
//
// Public standings page for the *current month* of BCWL.
// - Finds active league_month
// - Loads approved league_matches for that month
// - Loads players + pods
// - Uses standings-utils to compute + sort
// - Renders table

import { supabase } from "/js/supabase.js";
import { computeLeagueStats, sortStandings } from "/js/standings-utils.js";

const subtitleEl = document.getElementById("standings-subtitle");
const seasonLabelEl = document.getElementById("season-label");
const statusEl = document.getElementById("standings-status");
const errorEl = document.getElementById("standings-error");
const tbodyEl = document.getElementById("standings-body");

let currentMonth = null;
let currentSeason = null;
let podsById = {};

async function findCurrentMonth() {
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("league_months")
    .select("id, name, season_id, start_date, end_date")
    .lte("start_date", todayStr)
    .gte("end_date", todayStr)
    .limit(1);

  if (error) throw error;
  if (!data || !data.length) {
    throw new Error("No active league month found.");
  }
  return data[0];
}

async function loadSeason(seasonId) {
  const { data, error } = await supabase
    .from("league_seasons")
    .select("id, name, start_date, end_date")
    .eq("id", seasonId)
    .single();

  if (error) throw error;
  return data;
}

async function loadPodsForMonth(monthId) {
  const { data, error } = await supabase
    .from("pods")
    .select("id, name")
    .eq("month_id", monthId);

  if (error) throw error;

  const map = {};
  for (const p of data || []) {
    map[p.id] = p;
  }
  return map;
}

async function loadApprovedMatchesForMonth(monthId) {
  const { data, error } = await supabase
    .from("league_matches")
    .select("id, month_id, pod_id, player_a, player_b, winner, approved, notes")
    .eq("month_id", monthId)
    .eq("approved", true);

  if (error) throw error;
  return data || [];
}

async function loadPlayersForMatches(matches) {
  const ids = new Set();
  for (const m of matches || []) {
    if (m.player_a) ids.add(m.player_a);
    if (m.player_b) ids.add(m.player_b);
  }
  if (!ids.size) return [];

  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, rating, home_store")
    .in("id", Array.from(ids));

  if (error) throw error;
  return data || [];
}

function podColorClass(podName) {
  switch (podName) {
    case "Emerald":
      return "bg-emerald-100 text-emerald-800 border border-emerald-300";
    case "Ruby":
      return "bg-red-100 text-red-800 border border-red-300";
    case "Sapphire":
      return "bg-indigo-100 text-indigo-800 border border-indigo-300";
    case "Pearl":
      return "bg-slate-100 text-slate-800 border border-slate-300";
    default:
      return "bg-slate-50 text-slate-700 border border-slate-200";
  }
}

function formatPct(v) {
  if (v == null) return "—";
  return (v * 100).toFixed(1) + "%";
}

function renderStandings(rows, statsMap, playerPods) {
  tbodyEl.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 10;
    td.className = "px-3 py-4 text-center text-xs text-slate-500";
    td.textContent = "No completed matches yet.";
    tr.appendChild(td);
    tbodyEl.appendChild(tr);
    return;
  }

  let rank = 1;
  for (const row of rows) {
    const tr = document.createElement("tr");

    const podName =
      playerPods[row.player_id]?.name || "";

    const rankTd = document.createElement("td");
    rankTd.className = "px-3 py-2 text-left align-middle text-[11px]";
    rankTd.textContent = rank++;

    const nameTd = document.createElement("td");
    nameTd.className = "px-3 py-2 text-left align-middle";
    nameTd.textContent = row.full_name;

    const podTd = document.createElement("td");
    podTd.className = "px-3 py-2 text-left align-middle";
    if (podName) {
      const span = document.createElement("span");
      span.className =
        "inline-block px-2 py-0.5 rounded-full text-[10px] " +
        podColorClass(podName);
      span.textContent = podName;
      podTd.appendChild(span);
    } else {
      podTd.textContent = "—";
    }

    const ptsTd = document.createElement("td");
    ptsTd.className = "px-3 py-2 text-right align-middle";
    ptsTd.textContent = row.points;

    const wTd = document.createElement("td");
    wTd.className = "px-3 py-2 text-right align-middle";
    wTd.textContent = row.wins;

    const dTd = document.createElement("td");
    dTd.className = "px-3 py-2 text-right align-middle";
    dTd.textContent = row.draws;

    const lTd = document.createElement("td");
    lTd.className = "px-3 py-2 text-right align-middle";
    lTd.textContent = row.losses;

    const wpTd = document.createElement("td");
    wpTd.className = "px-3 py-2 text-right align-middle";
    wpTd.textContent = formatPct(row.matchWinPct);

    const omwTd = document.createElement("td");
    omwTd.className = "px-3 py-2 text-right align-middle";
    omwTd.textContent = formatPct(row.omw);

    const ratingTd = document.createElement("td");
    ratingTd.className = "px-3 py-2 text-right align-middle";
    ratingTd.textContent = row.rating ?? "—";

    tr.appendChild(rankTd);
    tr.appendChild(nameTd);
    tr.appendChild(podTd);
    tr.appendChild(ptsTd);
    tr.appendChild(wTd);
    tr.appendChild(dTd);
    tr.appendChild(lTd);
    tr.appendChild(wpTd);
    tr.appendChild(omwTd);
    tr.appendChild(ratingTd);

    tbodyEl.appendChild(tr);
  }
}

async function init() {
  try {
    statusEl.textContent = "Loading current month…";

    currentMonth = await findCurrentMonth();
    currentSeason = await loadSeason(currentMonth.season_id);

    subtitleEl.textContent =
      `Current month: ${currentMonth.name} ` +
      `(${currentMonth.start_date} → ${currentMonth.end_date})`;

    seasonLabelEl.textContent =
      `${currentSeason.name} · ${currentSeason.start_date} → ${currentSeason.end_date}`;

    podsById = await loadPodsForMonth(currentMonth.id);

    statusEl.textContent = "Loading completed matches…";

    const matches = await loadApprovedMatchesForMonth(currentMonth.id);
    const players = await loadPlayersForMatches(matches);

    const statsMap = computeLeagueStats(matches, players);
    const rows = sortStandings(statsMap);

    // Map player -> pod (for this month)
    const playerPods = {};
    if (matches.length) {
      // Get pod_members for this month’s pods
      const podIds = Object.keys(podsById);
      if (podIds.length) {
        const { data: members, error: memErr } = await supabase
          .from("pod_members")
          .select("pod_id, player_id")
          .in("pod_id", podIds);

        if (!memErr) {
          for (const m of members || []) {
            playerPods[m.player_id] = podsById[m.pod_id];
          }
        }
      }
    }

    renderStandings(rows, statsMap, playerPods);

    statusEl.textContent = `Showing ${rows.length} players.`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "";
    errorEl.textContent = err.message || "Error loading standings.";
    errorEl.classList.remove("hidden");
  }
}

init();
