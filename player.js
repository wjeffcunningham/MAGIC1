import { supabase } from "./config.js";

/* -------------------------------------
   DOM
------------------------------------- */
const nameEl    = document.getElementById("player-name");
const ratingEl  = document.getElementById("player-rating");
const avatarEl  = document.getElementById("player-avatar");

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

function prettify(slug) {
  return slug
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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

  /* 1️⃣ Load player profile registry */
  const { data: profile, error: profileError } = await supabase
    .from("player_profiles")
    .select("id, slug, verified_user_id")
    .eq("id", playerId)
    .maybeSingle();

  if (profileError || !profile) {
    nameEl.textContent = "Player not found";
    return;
  }

  let displayName = prettify(profile.slug);
  let avatarUrl   = null;

  /* 2️⃣ If verified, load public user profile */
  if (profile.verified_user_id) {

    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("alias, avatar_url")
      .eq("user_id", profile.verified_user_id)
      .maybeSingle();

    if (userProfile) {
      displayName = userProfile.alias || displayName;
      avatarUrl   = userProfile.avatar_url || null;
    }

  } else {
    // Publicly show that this name is unverified
    ratingEl.textContent = "Unverified player name";
  }

  nameEl.textContent = displayName;

  /* Avatar */
  if (avatarEl) {
    if (avatarUrl) {
      avatarEl.src = avatarUrl;
      avatarEl.alt = `${displayName} avatar`;
      avatarEl.style.display = "block";
    } else {
      avatarEl.style.display = "none";
    }
  }

  /* Load competitive data */
  await loadStandings(profile.id);
  await loadMatches(profile.id);
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
        row.ow_pct != null
          ? (row.ow_pct * 100).toFixed(1) + "%"
          : "—"
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