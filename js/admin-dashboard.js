// js/admin-dashboard.js
//
// Admin overview using the new db.js layer.
// If this page works, the architecture is sound.

import {
  getCurrentAuthUser,
  getPlayerById,
  listPendingPlayers,
  listPendingLeagueMatches,
  getActiveSeasonForToday,
  getMonthsForSeason,
  listActiveSignupsForSeason,
} from "/js/db.js";

import { getLocalSession } from "/js/session.js";

const adminNameEl = document.getElementById("admin-name");
const currentMonthEl = document.getElementById("current-month");
const statusEl = document.getElementById("admin-status");
const errorEl = document.getElementById("admin-error");

const pendingPlayersCountEl = document.getElementById("pending-players-count");
const pendingMatchesCountEl = document.getElementById("pending-matches-count");

/**
 * Ensures user is logged in AND is admin.
 */
async function ensureAdmin() {
  const sess = getLocalSession();
  if (!sess || !sess.playerId) {
    window.location.href = "/login.html";
    return;
  }

  const player = await getPlayerById(sess.playerId);
  if (!player) throw new Error("Could not load player record.");
  if (!player.is_admin) throw new Error("Admin access required.");

  adminNameEl.textContent = `${player.full_name} (Admin)`;
}

/**
 * Loads basic statistics for the dashboard.
 */
async function loadStats() {
  // Load parallel fast.
  const [
    pendingPlayers,
    pendingMatches,
    season,
  ] = await Promise.all([
    listPendingPlayers(),
    listPendingLeagueMatches(),
    getActiveSeasonForToday(),
  ]);

  pendingPlayersCountEl.textContent = pendingPlayers.length;
  pendingMatchesCountEl.textContent = pendingMatches.length;

  if (!season) {
    currentMonthEl.textContent = "No active league season.";
    return;
  }

  const months = await getMonthsForSeason(season.id);

  // Identify today's month.
  const today = new Date().toISOString().slice(0, 10);
  const activeMonth =
    months.find(
      (m) => m.start_date <= today && m.end_date >= today
    ) || null;

  if (activeMonth) {
    currentMonthEl.textContent =
      `${activeMonth.name} (${activeMonth.start_date} → ${activeMonth.end_date})`;
  } else {
    currentMonthEl.textContent = "Season active — no current month.";
  }
}

/**
 * Main init.
 */
async function init() {
  try {
    statusEl.textContent = "Loading admin dashboard…";
    await ensureAdmin();
    await loadStats();
    statusEl.textContent = "Ready.";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "";
    errorEl.textContent = err.message || "Failed to load admin dashboard.";
    errorEl.classList.remove("hidden");
  }
}

init();
