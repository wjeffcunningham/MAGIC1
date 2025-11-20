import { supabase } from "./supabase.js";
import { requireSession } from "./session.js";

const session = requireSession();

const nameEl = document.getElementById("mm-name");
const usernameEl = document.getElementById("mm-username");
const ratingEl = document.getElementById("mm-rating");

const loadingEl = document.getElementById("matches-loading");
const table = document.getElementById("matches-table");
const tbody = document.getElementById("matches-body");
const exportBtn = document.getElementById("export-csv");

let matchesCache = [];
let deltaMap = {};
let monthNameMap = {};
let opponentNameMap = {};

async function load() {
  // Player info
  const { data: player, error: pErr } = await supabase
    .from("players")
    .select("full_name, username, rating")
    .eq("id", session.playerId)
    .single();

  if (!player || pErr) {
    loadingEl.textContent = "Error loading player.";
    return;
  }

  nameEl.textContent = player.full_name;
  usernameEl.textContent = player.username || "(none)";
  ratingEl.textContent = player.rating;

  // Matches
  const { data: matches, error: mErr } = await supabase
    .from("league_matches")
    .select("*")
    .or(`player_a.eq.${session.playerId},player_b.eq.${session.playerId}`)
    .order("played_at", { ascending: false });

  if (mErr) {
    loadingEl.textContent = "Error loading matches.";
    return;
  }

  matchesCache = matches;

  // Collect ids for batch queries
  const opponentIds = new Set();
  const monthIds = new Set();
  const matchIds = new Set();

  for (const m of matches) {
    opponentIds.add(m.player_a);
    opponentIds.add(m.player_b);
    monthIds.add(m.month_id);
    matchIds.add(m.id);
  }

  // Opponent names
  const { data: players } = await supabase
    .from("players")
    .select("id, full_name")
    .in("id", Array.from(opponentIds));

  players?.forEach(p => {
    opponentNameMap[p.id] = p.full_name;
  });

  // Month names
  const { data: months } = await supabase
    .from("league_months")
    .select("id, name")
    .in("id", Array.from(monthIds));

  months?.forEach(m => {
    monthNameMap[m.id] = m.name;
  });

  // Rating deltas
  const { data: ratingRows } = await supabase
    .from("rating_history")
    .select("match_id, player_id, delta")
    .eq("player_id", session.playerId)
    .in("match_id", Array.from(matchIds));

  ratingRows?.forEach(r => {
    deltaMap[r.match_id] = r.delta;
  });

  // Render table
  loadingEl.classList.add("hidden");
  table.classList.remove("hidden");

  tbody.innerHTML = "";

  for (const m of matches) {
    const opponent =
      m.player_a === session.playerId
        ? opponentNameMap[m.player_b]
        : opponentNameMap[m.player_a];

    const result =
      m.winner === session.playerId ? "Win" : "Loss";

    const monthName =
      monthNameMap[m.month_id] || "?";

    const delta =
      deltaMap[m.id] ?? "";

    const approved = m.approved ? "Yes" : "Pending";

    const row = document.createElement("tr");
    row.className = "border-b";

    row.innerHTML = `
      <td class="py-2">${new Date(m.played_at).toLocaleDateString()}</td>
      <td class="py-2">${opponent}</td>
      <td class="py-2 font-semibold ${
        result === "Win" ? "text-green-700" : "text-red-700"
      }">${result}</td>
      <td class="py-2">${monthName}</td>
      <td class="py-2">${delta}</td>
      <td class="py-2">${m.notes || ""}</td>
      <td class="py-2">${approved}</td>
    `;

    tbody.appendChild(row);
  }
}

function exportCsv() {
  if (!matchesCache.length) return;

  const rows = [];
  rows.push([
    "Date",
    "Opponent",
    "Result",
    "Month",
    "RatingDelta",
    "Notes",
    "Approved",
  ].join(","));

  for (const m of matchesCache) {
    const opponent =
      m.player_a === session.playerId
        ? opponentNameMap[m.player_b]
        : opponentNameMap[m.player_a];

    const result =
      m.winner === session.playerId ? "Win" : "Loss";

    const monthName = monthNameMap[m.month_id] || "";
    const delta = deltaMap[m.id] ?? "";
    const notes = (m.notes || "").replace(/"/g, '""');
    const approved = m.approved ? "Yes" : "Pending";

    rows.push([
      new Date(m.played_at).toISOString(),
      opponent,
      result,
      monthName,
      delta,
      `"${notes}"`,
      approved,
    ].join(","));
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "my_matches_bcwl.csv";
  a.click();

  URL.revokeObjectURL(url);
}

exportBtn.addEventListener("click", exportCsv);

load();