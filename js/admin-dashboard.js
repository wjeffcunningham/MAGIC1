import { supabase } from "./supabase.js";

const statsContainer = document.getElementById("admin-stats");
const pendingPlayersCountEl = document.getElementById("pending-players-count");
const pendingMatchesCountEl = document.getElementById("pending-matches-count");
const errorEl = document.getElementById("admin-error");

async function loadStats() {
  try {
    // Players by status
    const { data: players, error: playersErr } = await supabase
      .from("players")
      .select("id, status, is_admin");

    if (playersErr) throw playersErr;

    const playerStats = {
      total: players.length,
      active: players.filter((p) => p.status === "active").length,
      pending: players.filter((p) => p.status === "pending").length,
      dropped: players.filter((p) => p.status === "dropped").length,
      admins: players.filter((p) => p.is_admin === true).length,
    };

    // Matches
    const { data: matches, error: matchesErr } = await supabase
      .from("league_matches")
      .select("id, approved");

    if (matchesErr) throw matchesErr;

    const matchStats = {
      total: matches.length,
      approved: matches.filter((m) => m.approved === true).length,
      pending: matches.filter((m) => m.approved === false).length,
    };

    // Events
    const { data: events, error: eventsErr } = await supabase
      .from("events")
      .select("id");

    if (eventsErr) throw eventsErr;

    const eventCount = events.length;

    // Render top-level cards
    statsContainer.innerHTML = `
      <div class="bg-white border rounded-xl p-4 shadow">
        <div class="text-xs font-semibold text-slate-600 uppercase mb-1">
          Active Players
        </div>
        <div class="text-3xl font-bold">${playerStats.active}</div>
        <p class="text-xs text-slate-500 mt-1">
          ${playerStats.total} total · ${playerStats.pending} pending
        </p>
      </div>

      <div class="bg-white border rounded-xl p-4 shadow">
        <div class="text-xs font-semibold text-slate-600 uppercase mb-1">
          Matches
        </div>
        <div class="text-3xl font-bold">${matchStats.approved}</div>
        <p class="text-xs text-slate-500 mt-1">
          ${matchStats.total} total · ${matchStats.pending} pending
        </p>
      </div>

      <div class="bg-white border rounded-xl p-4 shadow">
        <div class="text-xs font-semibold text-slate-600 uppercase mb-1">
          Events
        </div>
        <div class="text-3xl font-bold">${eventCount}</div>
        <p class="text-xs text-slate-500 mt-1">
          Includes B.C. Premodern Masters and future events.
        </p>
      </div>

      <div class="bg-white border rounded-xl p-4 shadow">
        <div class="text-xs font-semibold text-slate-600 uppercase mb-1">
          Admins
        </div>
        <div class="text-3xl font-bold">${playerStats.admins}</div>
        <p class="text-xs text-slate-500 mt-1">
          Players with admin privileges.
        </p>
      </div>
    `;

    // Work queue numbers
    pendingPlayersCountEl.textContent = playerStats.pending;
    pendingMatchesCountEl.textContent = matchStats.pending;
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Error loading admin stats.";
    errorEl.classList.remove("hidden");
  }
}

loadStats();