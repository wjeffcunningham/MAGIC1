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

async function loadPlayer() {

  const playerId   = qs("id");
  const playerSlug = qs("player");

  if (!playerId && !playerSlug) {
    nameEl.textContent = "Player not found";
    return;
  }

  const profileQuery = supabase
    .from("player_profiles")
    .select("id, slug, verified_user_id");

  const { data: profile, error: profileError } = await (
    playerId
      ? profileQuery.eq("id", playerId)
      : profileQuery.eq("slug", playerSlug)
  ).maybeSingle();

  if (profileError || !profile) {
    nameEl.textContent = "Player not found";
    return;
  }

  let displayName = prettify(profile.slug);
  let avatarUrl   = null;

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
    ratingEl.textContent = "Unverified player name";
  }

  nameEl.textContent = displayName;

  if (avatarEl) {
    if (avatarUrl) {
      avatarEl.src = avatarUrl;
      avatarEl.alt = `${displayName} avatar`;
      avatarEl.style.display = "block";
    } else {
      avatarEl.style.display = "none";
    }
  }

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
   Load matches (FINAL FIXED)
------------------------------------- */

async function loadMatches(playerId) {
  console.log("loadMatches called with:", playerId);
  
  const emptyEl = document.getElementById("matches-empty");
  const tableEl = document.getElementById("history-table");
  const tbody   = tableEl.querySelector("tbody");

  const { data, error } = await supabase
    .from("rating_history")
    .select(`
      event_id,
      created_at,
      match_date,
      event_name,
      league,
      round_number,
      match_index,
      opponent_slug,
      before_rating,
      after_rating
    `)
    .eq("player_id", playerId)
    .order("match_date", { ascending: false });

  emptyEl.style.display = "none";
  tableEl.style.display = "table";

  data.sort((a, b) => {
    const dateA = new Date(a.match_date || a.created_at);
    const dateB = new Date(b.match_date || b.created_at);
    if (dateB - dateA !== 0) return dateB - dateA;

    // Same date: Connections first, BCWL last
    const priority = { connections: 0, shg: 1, bcpmm: 2, bcwl: 3 };
    const pa = priority[a.league] ?? 9;
    const pb = priority[b.league] ?? 9;
    if (pa !== pb) return pa - pb;

    // Within same series: round descending
    if ((b.round_number ?? 0) !== (a.round_number ?? 0))
      return (b.round_number ?? 0) - (a.round_number ?? 0);

    return (b.match_index ?? 0) - (a.match_index ?? 0);
  });

  console.log(data.map(m => `${m.match_date} | ${m.league} | r${m.round_number} | ${m.opponent_slug}`));

  clear(tbody);

  data.forEach(m => {

    const tr = document.createElement("tr");

    const opponentCell = document.createElement("td");
    opponentCell.appendChild(
      playerLink(null, m.opponent_slug || "—")
    );

    const displayDate = m.match_date || m.created_at;
    const delta = (m.after_rating ?? 0) - (m.before_rating ?? 0);

    tr.innerHTML = `
      <td>${new Date(displayDate).toLocaleDateString()}</td>
      <td>${m.event_name || "—"}</td>
      <td></td>
      <td>—</td>
      <td class="center">${delta > 0 ? "+" + delta : delta}</td>
    `;

    tr.children[2].replaceWith(opponentCell);
    tbody.appendChild(tr);
  });
}

/* -------------------------------------
   Init
------------------------------------- */
loadPlayer();