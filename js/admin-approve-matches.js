// js/admin-approve-matches.js
//
// Clean consolidated admin match approval tool.
// Shows all league_matches.approved = false
// Admin can:
//  - Approve (apply Elo + rating_history + set approved=true)
//  - Reject (delete the match OR mark it invalid)
//
// Uses:
//   db.js (named functions)
//   elo.js (compute Elo deltas)
//

import {
  listPendingLeagueMatches,
  getPlayerById,
  approveLeagueMatch,
  insertRatingHistoryRow,
} from "/js/db.js";

import { getLocalSession } from "/js/session.js";
import { computeEloDelta } from "/js/elo.js"; // your existing elo.js

const listEl = document.getElementById("pending-matches-list");
const errorEl = document.getElementById("error-msg");

/**
 * Ensure you're an admin.
 */
async function ensureAdmin() {
  const sess = getLocalSession();
  if (!sess || !sess.playerId) {
    window.location.href = "/login.html";
    return false;
  }

  const me = await getPlayerById(sess.playerId);
  if (!me || !me.is_admin) {
    throw new Error("Admin access required.");
  }

  return true;
}

/**
 * Render a single pending match row.
 */
async function renderMatchRow(match) {
  const row = document.createElement("div");
  row.className =
    "border rounded-xl p-4 bg-white shadow flex flex-col gap-2 text-sm";

  const pA = await getPlayerById(match.player_a);
  const pB = await getPlayerById(match.player_b);

  const winner =
    match.winner === pA.id
      ? pA.full_name
      : match.winner === pB.id
      ? pB.full_name
      : "Draw";

  row.innerHTML = `
    <div class="flex justify-between items-center">
      <div>
        <strong>${pA.full_name}</strong>
        <span class="text-xs text-slate-500">vs</span>
        <strong>${pB.full_name}</strong>
      </div>
      <div class="text-xs text-slate-500">
        ${match.played_at.slice(0,10)}
      </div>
    </div>

    <div class="mt-1 text-xs">
      Reported Result:
      <span class="font-medium">${winner}</span>
    </div>

    ${
      match.notes
        ? `<div class="mt-1 text-[11px] text-slate-600">Notes: ${match.notes}</div>`
        : ""
    }

    <div class="flex gap-3 mt-2">
      <button class="approve-btn bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 rounded" data-id="${match.id}">
        Approve
      </button>

      <button class="reject-btn bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1 rounded" data-id="${match.id}">
        Reject
      </button>
    </div>
  `;

  listEl.appendChild(row);
}

/**
 * Approve a match:
 *  - compute Elo deltas
 *  - update both players' ratings
 *  - insert rating_history
 *  - mark match approved
 */
async function handleApprove(match) {
  const pA = await getPlayerById(match.player_a);
  const pB = await getPlayerById(match.player_b);

  let winner = match.winner; // could be null = draw

  // Elo calculation based on your elo.js
  const { newA, newB, deltaA, deltaB } = computeEloDelta({
    ratingA: pA.rating,
    ratingB: pB.rating,
    winnerId: winner, // null = draw
    k: match.k_factor || 16, // fallback
  });

  // Update player A’s rating
  await insertRatingHistoryRow({
    player_id: pA.id,
    match_id: match.id,
    old_rating: pA.rating,
    new_rating: newA,
    delta: deltaA,
  });

  await supabase
    .from("players")
    .update({ rating: newA })
    .eq("id", pA.id);

  // Update player B’s rating
  await insertRatingHistoryRow({
    player_id: pB.id,
    match_id: match.id,
    old_rating: pB.rating,
    new_rating: newB,
    delta: deltaB,
  });

  await supabase
    .from("players")
    .update({ rating: newB })
    .eq("id", pB.id);

  // Mark match approved
  await approveLeagueMatch(match.id);
}

/**
 * Reject a match.
 * Option: delete the match entirely (simplest), OR mark it invalid.
 */
async function handleReject(matchId) {
  // ❗ Option chosen: REMOVE the row completely
  await supabase
    .from("league_matches")
    .delete()
    .eq("id", matchId);
}

/**
 * Refresh list of pending matches
 */
async function refresh() {
  listEl.innerHTML = "";

  const pending = await listPendingLeagueMatches();

  if (pending.length === 0) {
    listEl.innerHTML =
      `<p class="text-sm text-slate-600 italic">No pending matches — all caught up.</p>`;
    return;
  }

  for (const match of pending) {
    await renderMatchRow(match);
  }

  // Attach button handlers
  document.querySelectorAll(".approve-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const match = pending.find((m) => m.id === id);
      try {
        await handleApprove(match);
        await refresh();
      } catch (e) {
        console.error(e);
        errorEl.textContent = e.message;
        errorEl.classList.remove("hidden");
      }
    });
  });

  document.querySelectorAll(".reject-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await handleReject(id);
        await refresh();
      } catch (e) {
        console.error(e);
        errorEl.textContent = e.message;
        errorEl.classList.remove("hidden");
      }
    });
  });
}

/**
 * Init
 */
async function init() {
  try {
    await ensureAdmin();
    await refresh();
  } catch (err) {
    console.error(err);
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
}

init();
