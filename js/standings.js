// standings.js — computes 3/1/0 standings for a given month

import { supabase } from "./supabase.js";

const monthSelect = document.getElementById("month-select");
const standingsEl = document.getElementById("standings-container");
const errorEl = document.getElementById("standings-error");

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

// -----------------------------
// Load months
// -----------------------------
async function loadMonths() {
  const { data, error } = await supabase
    .from("league_months")
    .select("id, name, start_date")
    .order("start_date");

  if (error) return showError("Error loading months.");

  monthSelect.innerHTML = data
    .map((m) => `<option value="${m.id}">${m.name}</option>`)
    .join("");

  loadStandings(data[0]?.id);

  monthSelect.addEventListener("change", (e) => {
    loadStandings(e.target.value);
  });
}

// -----------------------------
// Load matches for a given month
// -----------------------------
async function loadStandings(monthId) {
  standingsEl.innerHTML = "<p>Loading standings…</p>";

  const { data: matches, error } = await supabase
    .from("league_matches")
    .select(`
      id, month_id, result, games_won_a, games_won_b, approved,
      player_a ( id, full_name, rating ),
      player_b ( id, full_name, rating )
    `)
    .eq("month_id", monthId)
    .eq("approved", true);

  if (error) return showError("Error loading matches.");

  // Compute standings
  const standings = computeStandings(matches);

  standingsEl.innerHTML = renderTable(standings);
}

// -----------------------------
// Compute 3/1/0 standings table
// -----------------------------
function computeStandings(matches) {
  const table = {}; // playerId → record

  for (const m of matches) {
    const a = m.player_a;
    const b = m.player_b;

    if (!table[a.id])
      table[a.id] = { player: a, points: 0, matches: 0, oppPoints: 0 };
    if (!table[b.id])
      table[b.id] = { player: b, points: 0, matches: 0, oppPoints: 0 };

    // Add match played
    table[a.id].matches++;
    table[b.id].matches++;

    // League points (3/1/0)
    if (m.result === "A_WIN") {
      table[a.id].points += 3;
    } else if (m.result === "B_WIN") {
      table[b.id].points += 3;
    } else if (m.result === "DRAW") {
      table[a.id].points += 1;
      table[b.id].points += 1;
    }
  }

  // Compute opponent points for tie-break
  for (const m of matches) {
    const a = m.player_a;
    const b = m.player_b;

    const ptsA = table[a.id].points;
    const ptsB = table[b.id].points;

    table[a.id].oppPoints += ptsB;
    table[b.id].oppPoints += ptsA;
  }

  // Convert to array
  const arr = Object.values(table);

  // Sort by:
  // 1. points desc
  // 2. oppPoints desc (tie-break)
  // 3. rating desc (secondary tie-break)
  arr.sort((x, y) =>
    y.points - x.points ||
    y.oppPoints - x.oppPoints ||
    y.player.rating - x.player.rating
  );

  return arr;
}

// -----------------------------
// Render standings table
// -----------------------------
function renderTable(rows) {
  if (rows.length === 0) {
    return "<p class='text-slate-600'>No matches this month.</p>";
  }

  let html = `
    <table class="w-full border text-sm">
      <thead class="bg-slate-200 border-b">
        <tr>
          <th class="p-2 text-left">#</th>
          <th class="p-2 text-left">Player</th>
          <th class="p-2 text-left">Rating</th>
          <th class="p-2 text-left">Points</th>
          <th class="p-2 text-left">Matches</th>
          <th class="p-2 text-left">Opp Pts</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((r, i) => {
    html += `
      <tr class="border-b">
        <td class="p-2">${i + 1}</td>
        <td class="p-2 font-medium">${r.player.full_name}</td>
        <td class="p-2">${r.player.rating}</td>
        <td class="p-2 font-semibold">${r.points}</td>
        <td class="p-2">${r.matches}</td>
        <td class="p-2">${r.oppPoints}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  return html;
}

// Begin
loadMonths();