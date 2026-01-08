import { supabase } from "./config.js";

/* -------------------------------------
   DOM
------------------------------------- */
const nameEl    = document.getElementById("player-name");
const ratingEl = document.getElementById("player-rating");

// Optional avatar (safe if element doesn’t exist)
const avatarEl = document.getElementById("player-avatar");

const standingsEmptyEl = document.getElementById("standings-empty");
const standingsTableEl = document.getElementById("standings-table");
const standingsTbodyEl = standingsTableEl.querySelector("tbody");

/* -------------------------------------
   Helpers
------------------------------------- */
function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function playerLink(id, name) {
  if (!id) return document.createTextNode(name || "—");
  const a = document.createElement("a");
  a.href = `/player.html?id=${id}`;
  a.textContent = name || "—";
  return a;
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
    .select("id, full_name, rating, avatar_url")
    .eq("id", playerId)
    .single();

  if (error || !player) {
    nameEl.textContent = "Player not found";
    return;
  }

  nameEl.textContent = player.full_name || "Unnamed Player";
  ratingEl.textContent = `Elo rating: ${player.rating ?? "—"}`;

  // Avatar (optional)
  if (avatarEl && player.avatar_url) {
    avatarEl.src = player.avatar_url;
    avatarEl.alt = `${player.full_name || "Player"} avatar`;
  }

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
    standingsEmptyEl.style.display = "block";
    standingsTableEl.style.display = "none";
    return;
  }

  standingsEmptyEl.style.display = "none";
  standingsTableEl.style.display = "table";
  clear(standingsTbodyEl);

  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>Month ${row.month_index}</td>
      <td class="center">${row.points}</td>
      <td class="center">${
        row.ow_pct != null ? (row.ow_pct * 100).toFixed(1) + "%" : "—"
      }</td>
    `;
    standingsTbodyEl.appendChild(tr);
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
    .select("created_at, event_name, opponent_id, opponent_name, result, elo_delta")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    emptyEl.style.display = "block";
    tableEl.style.display = "none";
    return;
  }

  emptyEl.style.display = "none";
  tableEl.style.display = "table";
  clear(tbody);

  data.forEach(m => {
    const tr = document.createElement("tr");

    const opponentCell = document.createElement("td");
    opponentCell.appendChild(
      playerLink(m.opponent_id, m.opponent_name || "—")
    );

    tr.innerHTML = `
      <td>${new Date(m.created_at).toLocaleDateString()}</td>
      <td>${m.event_name || "—"}</td>
      <td></td>
      <td>${m.result || "—"}</td>
      <td class="center">${m.elo_delta ?? "—"}</td>
    `;

    tr.children[2].replaceWith(opponentCell);
    tbody.appendChild(tr);
  });
}

/* -------------------------------------
   Init
------------------------------------- */
loadPlayer();