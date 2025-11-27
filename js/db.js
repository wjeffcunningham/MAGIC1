// js/db.js
// Central, small set of named helpers around Supabase.
// Keep this file boring and predictable.

import { supabase } from "./supabase.js";

/**
 * Internal helpers
 */
function unwrapMany(result, context) {
  const { data, error } = result;
  if (error) {
    console.error(`[db] ${context} failed`, error);
    throw error;
  }
  return data || [];
}

function unwrapOneFromArray(result, context) {
  const rows = unwrapMany(result, context);
  return rows[0] || null;
}

/**
 * Get the current Supabase auth user (or null if not logged in).
 */
export async function getCurrentAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("[db] getCurrentAuthUser failed", error);
    throw error;
  }
  return data?.user ?? null;
}

/**
 * Get the players row for the current auth user, if any.
 * Assumes players.auth_user_id exists.
 */
export async function getCurrentPlayer() {
  const user = await getCurrentAuthUser();
  if (!user) return null;

  const result = await supabase
    .from("players")
    .select("*")
    .eq("auth_user_id", user.id)
    .limit(1);

  return unwrapOneFromArray(result, "getCurrentPlayer");
}

/**
 * Fetch a player by their players.id
 */
export async function getPlayerById(playerId) {
  const result = await supabase
    .from("players")
    .select("*")
    .eq("id", playerId)
    .limit(1);

  return unwrapOneFromArray(result, "getPlayerById");
}

/**
 * List all players with status = 'pending', ordered oldest-first.
 * Used on the admin "Pending Players" / onboarding view.
 */
export async function listPendingPlayers() {
  const result = await supabase
    .from("players")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return unwrapMany(result, "listPendingPlayers");
}

/**
 * Approve a player: status → 'active'.
 * You can extend `extraFields` later (e.g. home_store, play_style)
 * without touching all call sites.
 */
export async function approvePlayer(playerId, extraFields = {}) {
  const result = await supabase
    .from("players")
    .update({
      status: "active",
      ...extraFields,
    })
    .eq("id", playerId)
    .select("*")
    .limit(1);

  return unwrapOneFromArray(result, "approvePlayer");
}

/**
 * Drop / deactivate a player from the league: status → 'dropped'.
 * This does NOT delete the row or matches.
 */
export async function dropPlayer(playerId) {
  const result = await supabase
    .from("players")
    .update({ status: "dropped" })
    .eq("id", playerId)
    .select("*")
    .limit(1);

  return unwrapOneFromArray(result, "dropPlayer");
}

/**
 * Get the "current" league season based on today's date.
 * If nothing matches, returns null.
 */
export async function getActiveSeasonForToday() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const result = await supabase
    .from("league_seasons")
    .select("*")
    .lte("start_date", today)
    .gte("end_date", today)
    .order("start_date", { ascending: false })
    .limit(1);

  return unwrapOneFromArray(result, "getActiveSeasonForToday");
}

/**
 * Get all months for a season (Jan/Feb/Mar etc.), ordered by month_index.
 */
export async function getMonthsForSeason(seasonId) {
  const result = await supabase
    .from("league_months")
    .select("*")
    .eq("season_id", seasonId)
    .order("month_index", { ascending: true });

  return unwrapMany(result, "getMonthsForSeason");
}

/**
 * Get a single month (e.g. Jan) by season + month_index.
 * Returns null if none.
 */
export async function getMonthByIndex(seasonId, monthIndex) {
  const result = await supabase
    .from("league_months")
    .select("*")
    .eq("season_id", seasonId)
    .eq("month_index", monthIndex)
    .limit(1);

  return unwrapOneFromArray(result, "getMonthByIndex");
}

/**
 * Get the nearest season that is either active OR upcoming.
 * Picks the earliest season whose end_date is in the future.
 */
export async function getActiveOrUpcomingSeason() {
  const today = new Date().toISOString().slice(0, 10);

  const result = await supabase
    .from("league_seasons")
    .select("*")
    .gte("end_date", today)
    .order("start_date", { ascending: true })
    .limit(1);

  return unwrapOneFromArray(result, "getActiveOrUpcomingSeason");
}

/**
 * List all active league signups for a season, joined to players.
 * (Used for building pods, pairings, standings, etc.)
 */
export async function listActiveSignupsForSeason(seasonId) {
  const result = await supabase
    .from("league_signups")
    .select(
      `
      id,
      season_id,
      player_id,
      status,
      signup_date,
      player:players(
        id,
        full_name,
        email,
        home_store,
        remote_preference,
        rating,
        status
      )
    `
    )
    .eq("season_id", seasonId)
    .eq("status", "active");

  return unwrapMany(result, "listActiveSignupsForSeason");
}

/**
 * List pending league matches (league_matches.approved = false).
 * This is the raw data feed for the admin "Approve Matches" screen.
 */
export async function listPendingLeagueMatches() {
  const result = await supabase
    .from("league_matches")
    .select("*")
    .eq("approved", false)
    .order("played_at", { ascending: true });

  return unwrapMany(result, "listPendingLeagueMatches");
}

/**
 * Mark a league match as approved.
 * Rating updates should be handled in the caller (using elo.js),
 * then recorded into rating_history.
 */
export async function approveLeagueMatch(matchId) {
  const result = await supabase
    .from("league_matches")
    .update({ approved: true })
    .eq("id", matchId)
    .select("*")
    .limit(1);

  return unwrapOneFromArray(result, "approveLeagueMatch");
}

/**
 * Create a rating_history entry.
 * Caller is responsible for computing old/new/delta, and attaching
 * either match_id or event_id as appropriate.
 */
export async function insertRatingHistoryRow({
  player_id,
  match_id = null,
  event_id = null,
  old_rating,
  new_rating,
  delta,
}) {
  const result = await supabase
    .from("rating_history")
    .insert({
      player_id,
      match_id,
      event_id,
      old_rating,
      new_rating,
      delta,
    })
    .select("*")
    .limit(1);

  return unwrapOneFromArray(result, "insertRatingHistoryRow");
}

/**
 * List events (e.g. B.C. Premodern Masters, store events).
 * You can filter client-side by date / name / format.
 */
export async function listEvents() {
  const result = await supabase
    .from("events")
    .select("*")
    .order("event_date", { ascending: true });

  return unwrapMany(result, "listEvents");
}

/**
 * List registrations for a given event, joined to players.
 * Useful on an event admin page.
 */
export async function listEventRegistrations(eventId) {
  const result = await supabase
    .from("event_registrations")
    .select(
      `
      id,
      has_paid,
      created_at,
      player:players(
        id,
        full_name,
        email,
        home_store,
        rating,
        status
      )
    `
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  return unwrapMany(result, "listEventRegistrations");
}
