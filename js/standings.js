import { supabase } from "./supabase.js";

// Overall standings
const overallLoading = document.getElementById("overall-loading");
const overallTable = document.getElementById("overall-table");
const overallBody = document.getElementById("overall-body");

// Monthly
const monthPicker = document.getElementById("month-picker");
const monthlyLoading = document.getElementById("monthly-loading");
const monthlyTable = document.getElementById("monthly-table");
const monthlyBody = document.getElementById("monthly-body");

// Load overall
async function loadOverall() {
  const { data: players, error } = await supabase
    .from("players")
    .select("id, full_name, username, rating")
    .order("rating", { ascending: false });

  if (error) {
    overallLoading.textContent = "Error loading standings.";
    return;
  }

  overallLoading.classList.add("hidden");
  overallTable.classList.remove("hidden");

  let rank = 1;
  for (const p of players) {
    const row = document.createElement("tr");
    row.classList = "border-b";
    row.innerHTML = `
      <td class="py-2 pr-2">${rank++}</td>
      <td class="py-2 pr-2">${p.full_name} (${p.username})</td>
      <td class="py-2 pr-2">${p.rating}</td>
    `;
    overallBody.appendChild(row);
  }
}

// Load available months
async function loadMonths() {
  const { data: months, error } = await supabase
    .from("league_months")
    .select("*")
    .order("month_index");

  if (error) {
    monthPicker.textContent = "Error loading months.";
    return;
  }

  for (const m of months) {
    const btn = document.createElement("button");
    btn.className =
      "inline-block bg-slate-200 text-slate-800 px-3 py-1 rounded mr-2 mb-2 text-sm hover:bg-slate-300";
    btn.textContent = m.name;
    btn.addEventListener("click", () => loadMonthStandings(m.id));
    monthPicker.appendChild(btn);
  }
}

async function loadMonthStandings(monthId) {
  monthlyLoading.textContent = "Loading…";
  monthlyLoading.classList.remove("hidden");
  monthlyTable.classList.add("hidden");
  monthlyBody.innerHTML = "";

  // Matches for that month
  const { data, error } = await supabase
    .from("league_matches")
    .select("*")
    .eq("month_id", monthId)
    .eq("approved", true);

  if (error) {
    monthlyLoading.textContent = "Error loading standings.";
    return;
  }

  // Count wins/losses
  const stats = {};

  for (const m of data) {
    const a = m.player_a;
    const b = m.player_b;
    const winner = m.winner;

    if (!stats[a]) stats[a] = { wins: 0, losses: 0 };
    if (!stats[b]) stats[b] = { wins: 0, losses: 0 };

    if (winner === a) {
      stats[a].wins++;
      stats[b].losses++;
    } else if (winner === b) {
      stats[b].wins++;
      stats[a].losses++;
    }
  }

  if (Object.keys(stats).length === 0) {
    monthlyLoading.textContent = "No matches yet.";
    return;
  }

  // Load all players
  const ids = Object.keys(stats);
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, full_name, username")
    .in("id", ids);

  if (pErr) {
    monthlyLoading.textContent = "Error loading players.";
    return;
  }

  const pMap = {};
  for (const p of players) pMap[p.id] = p;

  monthlyLoading.classList.add("hidden");
  monthlyTable.classList.remove("hidden");

  for (const pid of ids) {
    const p = pMap[pid];
    const s = stats[pid];

    const row = document.createElement("tr");
    row.className = "border-b";
    row.innerHTML = `
      <td class="py-2 pr-2">${p.full_name} (${p.username})</td>
      <td class="py-2 pr-2">${s.wins}</td>
      <td class="py-2 pr-2">${s.losses}</td>
    `;

    monthlyBody.appendChild(row);
  }
}

loadOverall();
loadMonths();