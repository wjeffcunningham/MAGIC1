// /js/approve-matches.js
// Admin tool: approve/reject matches, update global + league ratings

import { supabase } from "./supabase.js";
import { requireAdmin } from "./admin-guard.js";
import { computeElo, scoreFromResult } from "./elo.js";

const container = document.getElementById("pending-container");
const errorEl = document.getElementById("admin-error");

await requireAdmin();

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function clearError() {
  errorEl.classList.add("hidden");
}

// Load all pending, not rejected matches
async function loadPending() {
  container.innerHTML = "<p>Loading pending matches…</p>";

  const { data: matches, error } = await supabase
    .from("league_matches")
    .select(`
      id,
      result,
      games_won_a,
      games_won_b,
      event_id,
      played_at,
      notes,
      player_a:player_a (
        id,
        full_name,
        rating,
        league_rating,
        play_style
      ),
      player_b:player_b (
        id,
        full_name,
        rating,
        league_rating,
        play_style
      ),
      events:event_id (
        id,
        name,
        k_factor
      )
    `)
    .eq("approved", false)
    .eq("rejected", false)
    .order("played_at", { ascending: true });

  if (error) {
    console.error(error);
    return showError("Error loading pending matches.");
  }

  if (!matches.length) {
    container.innerHTML = `<p class="text-slate-600">No matches pending approval.</p>`;
    return;
  }

  container.innerHTML = matches.map(renderMatch).join("");
}

function formatResult(m) {
  const score = `(${m.games_won_a ?? "?"}-${m.games_won_b ?? "?"})`;
  switch (m.result) {
    case "A_WIN": return `Player A wins ${score}`;
    case "B_WIN": return `Player B wins ${score}`;
    case "DRAW":  return `Draw ${score}`;
    default:      return `Result: ${score}`;
  }
}

function renderMatch(m) {
  const pA = m.player_a;
  const pB = m.player_b;
  const ev = m.events;

  return `
    <div class="bg-white border rounded-xl shadow p-4 space-y-2" id="match-${m.id}">
      <div class="text-xs text-slate-500">
        Match ID: ${m.id} · Played ${new Date(m.played_at).toLocaleString()}
      </div>

      <div class="text-sm">
        <strong>${pA.full_name}</strong> (R ${pA.rating}, L ${pA.league_rating})<br/>
        vs<br/>
        <strong>${pB.full_name}</strong> (R ${pB.rating}, L ${pB.league_rating})
      </div>

      <div class="text-xs text-slate-600">
        ${formatResult(m)}
      </div>

      <div class="text-xs text-slate-600">
        ${
          ev
            ? `Event: ${ev.name} (K=${ev.k_factor})`
            : `League match (K depends on play-style)`
        }
      </div>

      ${m.notes ? `<div class="text-xs mt-1">Note: ${m.notes}</div>` : ""}

      <div class="flex gap-3 pt-2">
        <button
          class="px-3 py-1 bg-emerald-600 text-white rounded text-sm"
          onclick="approveMatch('${m.id}')"
        >
          Approve & Apply Ratings
        </button>

        <button
          class="px-3 py-1 bg-red-600 text-white rounded text-sm"
          onclick="rejectMatch('${m.id}')"
        >
          Reject
        </button>
      </div>
    </div>
  `;
}

// Expose handlers to window
window.approveMatch = approveMatch;
window.rejectMatch = rejectMatch;

// Helper: (league) K-factor based on play_style
function leagueK(playStyle) {
  return playStyle === "casual" ? 8 : 16;
}

// Load full match row again (fresh)
async function fetchMatch(matchId) {
  const { data, error } = await supabase
    .from("league_matches")
    .select(`
      id,
      result,
      games_won_a,
      games_won_b,
      event_id,
      played_at,
      notes,
      player_a:player_a (
        id,
        full_name,
        rating,
        league_rating,
        play_style
      ),
      player_b:player_b (
        id,
        full_name,
        rating,
        league_rating,
        play_style
      ),
      events:event_id (
        id,
        name,
        k_factor
      )
    `)
    .eq("id", matchId)
    .single();

  if (error) {
    console.error(error);
    showError("Error loading match for approval.");
    return null;
  }
  return data;
}

async function approveMatch(matchId) {
  clearError();

  const m = await fetchMatch(matchId);
  if (!m) return;

  const pA = m.player_a;
  const pB = m.player_b;
  const ev = m.events;
  const scoreA = scoreFromResult(m.result);

  // ---- Global rating K ----
  let globalK;
  if (ev && ev.k_factor) {
    // Event K controls global ELO
    globalK = ev.k_factor;
  } else {
    // League match uses play-style K
    globalK = leagueK(pA.play_style || "competitive");
  }

  // Compute new global ratings
  const global = computeElo(pA.rating, pB.rating, scoreA, globalK);

  // ---- League rating only changes for league matches (no event) ----
  let leagueA = pA.league_rating;
  let leagueB = pB.league_rating;
  let leagueDeltaA = 0;
  let leagueDeltaB = 0;

  if (!m.event_id) {
    const leagueKval = leagueK(pA.play_style || "competitive");
    const leagueRes = computeElo(
      pA.league_rating,
      pB.league_rating,
      scoreA,
      leagueKval
    );
    leagueA = leagueRes.newA;
    leagueB = leagueRes.newB;
    leagueDeltaA = leagueRes.deltaA;
    leagueDeltaB = leagueRes.deltaB;
  }

  // 1) Update both players
  const { error: errA } = await supabase
    .from("players")
    .update({
      rating: global.newA,
      league_rating: leagueA,
    })
    .eq("id", pA.id);

  if (errA) {
    console.error(errA);
    return showError("Error updating Player A rating.");
  }

  const { error: errB } = await supabase
    .from("players")
    .update({
      rating: global.newB,
      league_rating: leagueB,
    })
    .eq("id", pB.id);

  if (errB) {
    console.error(errB);
    return showError("Error updating Player B rating.");
  }

  // 2) Write rating history rows
  const { error: errHist } = await supabase.from("rating_history").insert([
    {
      player_id: pA.id,
      match_id: m.id,
      event_id: m.event_id,
      old_rating: pA.rating,
      new_rating: global.newA,
      delta: global.deltaA,
      old_league_rating: pA.league_rating,
      new_league_rating: leagueA,
      league_delta: leagueDeltaA,
    },
    {
      player_id: pB.id,
      match_id: m.id,
      event_id: m.event_id,
      old_rating: pB.rating,
      new_rating: global.newB,
      delta: global.deltaB,
      old_league_rating: pB.league_rating,
      new_league_rating: leagueB,
      league_delta: leagueDeltaB,
    },
  ]);

  if (errHist) {
    console.error(errHist);
    return showError("Error writing rating history.");
  }

  // 3) Mark match approved
  const { error: errApp } = await supabase
    .from("league_matches")
    .update({ approved: true })
    .eq("id", m.id);

  if (errApp) {
    console.error(errApp);
    return showError("Error marking match approved.");
  }

  const card = document.getElementById(`match-${m.id}`);
  if (card) card.remove();
}

async function rejectMatch(matchId) {
  clearError();

  const { error } = await supabase
    .from("league_matches")
    .update({ rejected: true })
    .eq("id", matchId);

  if (error) {
    console.error(error);
    return showError("Error rejecting match.");
  }

  const card = document.getElementById(`match-${matchId}`);
  if (card) card.remove();
}

// Kick off
loadPending();