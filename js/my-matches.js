// /js/my-matches.js
// Player-facing match history with pending / approved / rejected,
// and the ability to cancel your own pending submissions.

import { supabase } from "./supabase.js";
import { getLocalSession } from "./session.js";

const statusEl   = document.getElementById("matches-status");
const errorEl    = document.getElementById("matches-error");
const pendingEl  = document.getElementById("pending-list");
const approvedEl = document.getElementById("approved-list");
const rejectedEl = document.getElementById("rejected-list");

let currentPlayerId = null;

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function clearError() {
  errorEl.classList.add("hidden");
}

// Redirect to login if not logged in
function requireSessionOrRedirect() {
  const session = getLocalSession();
  if (!session) {
    const next = encodeURIComponent("/my-matches.html");
    window.location.href = `/login.html?next=${next}`;
    return null;
  }
  return session;
}

function formatWhen(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function formatScore(m, perspective) {
  // perspective: "A" or "B"
  const a = m.games_won_a ?? "?";
  const b = m.games_won_b ?? "?";
  const score = `${a}-${b}`;

  switch (m.result) {
    case "A_WIN":
      return perspective === "A" ? `Win ${score}` : `Loss ${b}-${a}`;
    case "B_WIN":
      return perspective === "B" ? `Win ${score}` : `Loss ${b}-${a}`;
    case "DRAW":
      return `Draw ${score}`;
    default:
      return `Result ${score}`;
  }
}

function matchTypeLabel(m) {
  if (m.events) {
    return `Event · ${m.events.name ?? "Untitled Event"}`;
  }
  return "League match";
}

function effectiveK(m) {
  if (m.events && m.events.k_factor) return m.events.k_factor;
  if (m.k_factor) return m.k_factor;
  return "–";
}

// -------- fetch + render --------

async function loadMatches() {
  clearError();
  statusEl.textContent = "Loading your matches…";

  // 1) Load matches where this player is A or B
  const { data: matches, error } = await supabase
    .from("league_matches")
    .select(`
      id,
      result,
      games_won_a,
      games_won_b,
      event_id,
      k_factor,
      played_at,
      approved,
      rejected,
      notes,
      reported_by,
      player_a:player_a (
        id,
        full_name
      ),
      player_b:player_b (
        id,
        full_name
      ),
      events:event_id (
        id,
        name,
        k_factor
      )
    `)
    .or(`player_a.eq.${currentPlayerId},player_b.eq.${currentPlayerId}`)
    .order("played_at", { ascending: false });

  if (error) {
    console.error(error);
    showError("Error loading matches.");
    statusEl.textContent = "Error.";
    return;
  }

  if (!matches || matches.length === 0) {
    statusEl.textContent = "You have no matches recorded yet.";
    pendingEl.innerHTML = `<p class="text-slate-500 text-sm">No pending matches.</p>`;
    approvedEl.innerHTML = `<p class="text-slate-500 text-sm">No approved matches.</p>`;
    rejectedEl.innerHTML = `<p class="text-slate-500 text-sm">No rejected matches.</p>`;
    return;
  }

  // 2) Get rating history for this player for all these matches
  const matchIds = matches.map(m => m.id);
  const { data: hist, error: histErr } = await supabase
    .from("rating_history")
    .select(
      "match_id, old_rating, new_rating, delta, old_league_rating, new_league_rating, league_delta"
    )
    .eq("player_id", currentPlayerId)
    .in("match_id", matchIds);

  const histByMatchId = {};
  if (!histErr && hist) {
    for (const row of hist) {
      histByMatchId[row.match_id] = row;
    }
  }

  // 3) Partition matches
  const pending = [];
  const approved = [];
  const rejected = [];

  for (const m of matches) {
    if (m.rejected) {
      rejected.push(m);
    } else if (m.approved) {
      approved.push(m);
    } else {
      pending.push(m);
    }
  }

  renderPending(pending);
  renderApproved(approved, histByMatchId);
  renderRejected(rejected);

  statusEl.textContent = `Loaded ${matches.length} matches: ${approved.length} approved, ${pending.length} pending, ${rejected.length} rejected.`;
}

function isPlayerA(m) {
  return m.player_a && m.player_a.id === currentPlayerId;
}

function opponentName(m) {
  if (isPlayerA(m)) return m.player_b?.full_name ?? "(opponent)";
  return m.player_a?.full_name ?? "(opponent)";
}

// ------- render sections -------

function renderPending(list) {
  if (!list.length) {
    pendingEl.innerHTML = `<p class="text-slate-500 text-sm">No pending matches.</p>`;
    return;
  }

  pendingEl.innerHTML = list
    .map((m) => {
      const perspective = isPlayerA(m) ? "A" : "B";
      const scoreStr = formatScore(m, perspective);
      const typeStr = matchTypeLabel(m);

      const canCancel = m.reported_by === currentPlayerId;

      return `
        <div class="border rounded-lg p-3 bg-yellow-50 flex flex-col gap-1" id="match-${m.id}">
          <div class="flex justify-between text-sm">
            <span class="font-semibold">
              vs ${opponentName(m)}
            </span>
            <span class="text-xs text-slate-500">
              ${formatWhen(m.played_at)}
            </span>
          </div>
          <div class="text-xs text-slate-700">
            ${typeStr} · ${scoreStr}
          </div>
          ${
            m.notes
              ? `<div class="text-xs text-slate-500 mt-1">Note: ${m.notes}</div>`
              : ""
          }
          <div class="flex justify-between items-center mt-2">
            <span class="text-[11px] text-slate-500">
              Submitted by ${
                m.reported_by === currentPlayerId ? "you" : "your opponent"
              }
            </span>
            ${
              canCancel
                ? `<button
                     class="text-[11px] px-2 py-1 border rounded bg-white hover:bg-red-50 text-red-700"
                     onclick="window.cancelMatch('${m.id}')"
                   >
                     Cancel submission
                   </button>`
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");
}

function renderApproved(list, histMap) {
  if (!list.length) {
    approvedEl.innerHTML = `<p class="text-slate-500 text-sm">No approved matches yet.</p>`;
    return;
  }

  approvedEl.innerHTML = list
    .map((m) => {
      const perspective = isPlayerA(m) ? "A" : "B";
      const scoreStr = formatScore(m, perspective);
      const typeStr = matchTypeLabel(m);
      const kVal = effectiveK(m);
      const hist = histMap[m.id];

      const deltaStr =
        hist && typeof hist.delta === "number"
          ? (hist.delta >= 0 ? `+${hist.delta}` : `${hist.delta}`)
          : "–";

      const leagueDeltaStr =
        hist && typeof hist.league_delta === "number"
          ? (hist.league_delta >= 0 ? `+${hist.league_delta}` : `${hist.league_delta}`)
          : "–";

      const newRatingStr =
        hist && typeof hist.new_rating === "number"
          ? hist.new_rating
          : "—";

      const newLeagueStr =
        hist && typeof hist.new_league_rating === "number"
          ? hist.new_league_rating
          : "—";

      return `
        <div class="border rounded-lg p-3 bg-white flex flex-col gap-1">
          <div class="flex justify-between text-sm">
            <span class="font-semibold">
              vs ${opponentName(m)}
            </span>
            <span class="text-xs text-slate-500">
              ${formatWhen(m.played_at)}
            </span>
          </div>
          <div class="text-xs text-slate-700">
            ${typeStr} · ${scoreStr}
          </div>
          <div class="text-[11px] text-slate-500 mt-1">
            K = ${kVal} · ΔRating = ${deltaStr} → ${newRatingStr}
            <br/>
            League Δ = ${leagueDeltaStr} → ${newLeagueStr}
          </div>
          ${
            m.notes
              ? `<div class="text-xs text-slate-500 mt-1">Note: ${m.notes}</div>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

function renderRejected(list) {
  if (!list.length) {
    rejectedEl.innerHTML = `<p class="text-slate-500 text-sm">No rejected or cancelled matches.</p>`;
    return;
  }

  rejectedEl.innerHTML = list
    .map((m) => {
      const perspective = isPlayerA(m) ? "A" : "B";
      const scoreStr = formatScore(m, perspective);
      const typeStr = matchTypeLabel(m);

      return `
        <div class="border rounded-lg p-3 bg-slate-50 flex flex-col gap-1">
          <div class="flex justify-between text-sm">
            <span class="font-semibold">
              vs ${opponentName(m)}
            </span>
            <span class="text-xs text-slate-500">
              ${formatWhen(m.played_at)}
            </span>
          </div>
          <div class="text-xs text-slate-700">
            ${typeStr} · ${scoreStr}
          </div>
          <div class="text-[11px] text-slate-500 mt-1">
            Status: rejected/cancelled.
          </div>
        </div>
      `;
    })
    .join("");
}

// ------- cancel pending match (player-owned only) -------

async function cancelMatch(matchId) {
  if (!confirm("Cancel this pending match submission? This cannot be undone.")) {
    return;
  }

  clearError();
  statusEl.textContent = "Cancelling match…";

  // Only allow delete if it is:
  //  - reported_by = current player
  //  - approved = false
  //  - rejected = false
  const { error } = await supabase
    .from("league_matches")
    .delete()
    .eq("id", matchId)
    .eq("reported_by", currentPlayerId)
    .eq("approved", false)
    .eq("rejected", false);

  if (error) {
    console.error(error);
    showError("Could not cancel match. It may have just been approved/rejected.");
    statusEl.textContent = "Error.";
    return;
  }

  const card = document.getElementById(`match-${matchId}`);
  if (card) card.remove();

  statusEl.textContent = "Pending match cancelled.";
  // Optionally re-load everything to keep counts accurate:
  await loadMatches();
}

// Expose for onclick in rendered HTML
window.cancelMatch = cancelMatch;

// ------- init -------

async function init() {
  const session = requireSessionOrRedirect();
  if (!session) return;

  currentPlayerId = session.playerId;
  await loadMatches();
}

init();