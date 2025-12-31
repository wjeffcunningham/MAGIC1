import { supabase } from "./config.js";

const nameEl     = document.getElementById("player-name");
const ratingEl  = document.getElementById("player-rating");

const emptyEl   = document.getElementById("standings-empty");
const tableEl   = document.getElementById("standings-table");
const tbodyEl   = tableEl.querySelector("tbody");

/* -------------------------------------
   Helpers
------------------------------------- */
function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/* -------------------------------------
   Load player
------------------------------------- */
async function loadPlayer() {
  const playerId = qs("id");
  if (!playerId) {
    nameEl.textContent = "Player not found";
    return;
  }

  const { data: player, error } = await supabase
    .from("players")
    .select("id, full_name, rating")
    .eq("id", playerId)
    .single();

  if (error || !player) {
    nameEl.textContent = "Player not found";
    return;
  }

  nameEl.textContent = player.full_name || "Unnamed Player";
  ratingEl.textContent = `Elo rating: ${player.rating ?? "—"}`;

  await loadStandings(player.id);
  await loadMatches(player.id);
}

/* -------------------------------------
   Load standings
------------------------------------- */
async function loadStandings(playerId) {
  const { data, error } = await supabase
    .from("month_standings")
    .select("month_index, points, ow_pct")
    .eq("player_id", playerId)
    .order("month_index", { ascending: true });

  if (error || !data || data.length === 0) {
    emptyEl.style.display = "block";
    tableEl.style.display = "none";
    return;
  }

  emptyEl.style.display = "none";
  tableEl.style.display = "table";
  clear(tbodyEl);

  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>Month ${row.month_index}</td>
      <td class="center">${row.points}</td>
      <td class="center">${row.ow_pct != null ? (row.ow_pct * 100).toFixed(1) + "%" : "—"}</td>
    `;
    tbodyEl.appendChild(tr);
  });
}

/* -------------------------------------
   Load matches
------------------------------------- */
async function loadMatches(playerId) {
  const emptyEl = document.getElementById("matches-empty");
  const tableEl = document.getElementById("matches-table");
  const tbody   = tableEl.querySelector("tbody");

  const { data, error } = await supabase
    .from("match_history")
    .select("*")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    emptyEl.style.display = "block";
    tableEl.style.display = "none";
    return;
  }

  emptyEl.style.display = "none";
  tableEl.style.display = "table";
  tbody.innerHTML = "";

  data.forEach(m => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(m.created_at).toLocaleDateString()}</td>
      <td>${m.event_name}</td>
      <td>${m.opponent_name || "—"}</td>
      <td>${m.result}</td>
      <td class="center">${m.elo_delta ?? "—"}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* -------------------------------------
   Init
------------------------------------- */
loadPlayer();