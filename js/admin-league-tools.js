// /js/admin-league-tools.js
// Admin-only league orchestration (Supabase mutations).
// - Sync players from site_users/league_members
// - Import round CSV -> results + Elo + rating_history
// - Create month snapshot (league_months + month_standings)
// - Generate pairings drafts -> pairings table (finalize separately)
// - Import tournament placements -> tournaments + tournament_results (+ optional Elo if match-by-match later)

import { supabase } from "./config.js";
import { CURRENT_SEASON } from "./db.js";
import {
  parseRoundCSV,
  updateElo,
  parseCSV,
  generatePools,
  generateMonthlyPairings,
  computeTQ
} from "./league-utils.js";

/* =========================================================
   CONFIG / CONSTANTS
========================================================= */

export const DEFAULT_LEAGUE_K = 16; // per your spec
// External tournaments: K varies, but Elo updates there are optional unless you import match-by-match.
// We'll store TQ from placements now; Elo-from-tournament requires match rounds.

/* =========================================================
   HELPERS
========================================================= */

function normEmail(e) {
  return (e || "").trim().toLowerCase();
}

function nameForUser(u) {
  return u.moderated_handle || u.handle || u.email || "Player";
}

async function requireModOrThrow() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("Not logged in.");

  const { data: profile, error } = await supabase
    .from("site_users")
    .select("id, is_mod")
    .eq("id", uid)
    .single();

  if (error || !profile) throw new Error("Profile missing / cannot verify admin.");
  if (!profile.is_mod) throw new Error("Admin privileges required.");
  return profile;
}

async function fetchPlayersByEmail(emails) {
  const uniq = [...new Set((emails || []).map(normEmail).filter(Boolean))];
  if (uniq.length === 0) return [];

  const { data, error } = await supabase
    .from("players")
    .select("id, email, full_name, rating")
    .in("email", uniq);

  if (error) throw new Error("players lookup failed: " + (error.message || "unknown error"));
  return data || [];
}

/* =========================================================
   1) SYNC players table from league roster (site_users + league_members)
   Why: your login/signup creates site_users rows, but not players rows.
========================================================= */

export async function syncPlayersFromLeagueMembers({
  season = CURRENT_SEASON,
  ratingDefault = 1600
} = {}) {
  await requireModOrThrow();

  // Pull season members
  const { data: members, error: memErr } = await supabase
    .from("league_members")
    .select("user_id")
    .eq("season", season);

  if (memErr) throw new Error("league_members fetch failed: " + (memErr.message || "unknown"));
  const userIds = [...new Set((members || []).map(m => m.user_id).filter(Boolean))];
  if (userIds.length === 0) return { created: 0, skipped: 0 };

  // Pull corresponding site_users
  const { data: users, error: usersErr } = await supabase
    .from("site_users")
    .select("id, email, handle, moderated_handle")
    .in("id", userIds);

  if (usersErr) throw new Error("site_users fetch failed: " + (usersErr.message || "unknown"));

  const emails = (users || []).map(u => normEmail(u.email)).filter(Boolean);
  const existing = await fetchPlayersByEmail(emails);
  const existingByEmail = new Map(existing.map(p => [normEmail(p.email), p]));

  const toInsert = [];
  let skipped = 0;

  (users || []).forEach(u => {
    const email = normEmail(u.email);
    if (!email) return;

    if (existingByEmail.has(email)) {
      skipped++;
      return;
    }

    toInsert.push({
      user_id: u.id,
      full_name: nameForUser(u),
      email,
      rating: ratingDefault,
      has_paid: false
    });
  });

  if (toInsert.length === 0) return { created: 0, skipped };

  const { error: insErr } = await supabase.from("players").insert(toInsert);
  if (insErr) throw new Error("players insert failed: " + (insErr.message || "unknown"));

  return { created: toInsert.length, skipped };
}

/* =========================================================
   2) ROUND IMPORT (results + Elo + rating_history)
========================================================= */

export async function importLeagueRoundFromCSVText({
  season = CURRENT_SEASON,
  round,
  csvText,
  K = DEFAULT_LEAGUE_K,
  allowOverwrite = false
} = {}) {
  await requireModOrThrow();

  if (!round || round < 1) throw new Error("Round must be a positive integer.");
  if (!csvText) throw new Error("Missing CSV text.");

  // Guard: prevent accidental double-import
  const { data: existing, error: existErr } = await supabase
    .from("results")
    .select("id")
    .eq("league", season)
    .eq("round", round)
    .limit(1);

  if (existErr) throw new Error("results existence check failed: " + (existErr.message || "unknown"));

  if (existing && existing.length > 0) {
    if (!allowOverwrite) {
      throw new Error(`Results already exist for ${season} round ${round}. Set allowOverwrite=true to replace.`);
    }
    // Overwrite: delete old rows for this league+round
    const { error: delErr } = await supabase
      .from("results")
      .delete()
      .eq("league", season)
      .eq("round", round);

    if (delErr) throw new Error("Failed to delete existing results: " + (delErr.message || "unknown"));
    // NOTE: Overwrite does NOT rewind ratings automatically.
    // For full rebuild, use rebuildSeasonRatingsFromResults() (we can add next).
  }

  const matches = parseRoundCSV(csvText);
  const emails = matches.flatMap(m => [m.emailA, m.emailB]);

  const players = await fetchPlayersByEmail(emails);
  const byEmail = new Map(players.map(p => [normEmail(p.email), p]));

  // Validate all players exist
  for (const m of matches) {
    if (!byEmail.has(m.emailA)) throw new Error(`No players row found for email: ${m.emailA}. Run syncPlayersFromLeagueMembers() or create players.`);
    if (!byEmail.has(m.emailB)) throw new Error(`No players row found for email: ${m.emailB}. Run syncPlayersFromLeagueMembers() or create players.`);
  }

  // Insert results and apply Elo sequentially (deterministic)
  const resultsToInsert = [];
  const ratingUpdates = new Map(); // player_id -> new_rating (local simulation)
  const ratingHistoryRows = [];

  function getRating(p) {
    const cached = ratingUpdates.get(p.id);
    return Number.isFinite(cached) ? cached : (Number.isFinite(p.rating) ? p.rating : 1600);
  }

  for (const m of matches) {
    const pA = byEmail.get(m.emailA);
    const pB = byEmail.get(m.emailB);

    const rA = getRating(pA);
    const rB = getRating(pB);

    // winner for DB: winner uuid is required by your schema.
    // For draws, we store winner = p1 (arbitrary) AND still apply draw Elo.
    // If you want true draw support, we can add a results.result column later.
    let winnerId = pA.id;
    if (m.winner === "B") winnerId = pB.id;
    if (m.winner === "D") winnerId = pA.id;

resultsToInsert.push({
  league: season,
  round,
  p1: pA.id,
  p2: pB.id,
  result: m.winner,                 // 'A' | 'B' | 'D'
  winner: m.winner === 'D'
    ? null
    : (m.winner === 'A' ? pA.id : pB.id)
});

    const [newA, newB] = updateElo(rA, rB, m.winner, K);

    ratingHistoryRows.push({
      player_id: pA.id,
      league: season,
      round,
      before_rating: rA,
      after_rating: newA
    });
    ratingHistoryRows.push({
      player_id: pB.id,
      league: season,
      round,
      before_rating: rB,
      after_rating: newB
    });

    ratingUpdates.set(pA.id, newA);
    ratingUpdates.set(pB.id, newB);
  }

  // 1) Insert results
  const { error: insResErr } = await supabase.from("results").insert(resultsToInsert);
  if (insResErr) throw new Error("results insert failed: " + (insResErr.message || "unknown"));

  // 2) Insert rating history (bulk)
  const { error: histErr } = await supabase.from("rating_history").insert(ratingHistoryRows);
  if (histErr) throw new Error("rating_history insert failed: " + (histErr.message || "unknown"));

  // 3) Apply rating updates (bulk-ish via per-row updates)
  // Supabase doesn't support a single UPDATE ... FROM VALUES via client,
  // so we do sequential updates for correctness.
  for (const [playerId, newRating] of ratingUpdates.entries()) {
    const { error: upErr } = await supabase
      .from("players")
      .update({ rating: newRating })
      .eq("id", playerId);

    if (upErr) throw new Error("players rating update failed: " + (upErr.message || "unknown"));
  }

  return {
    season,
    round,
    matchesImported: matches.length,
    playersUpdated: ratingUpdates.size,
    K
  };
}

/* =========================================================
   3) MONTH SNAPSHOT (league_months + month_standings)
   - standings CSV should include emails
========================================================= */

export async function ensureLeagueMonth({
  league = CURRENT_SEASON,
  leagueYear,
  monthIndex
} = {}) {
  await requireModOrThrow();

  if (!leagueYear || !monthIndex) throw new Error("leagueYear and monthIndex are required.");

  // Try fetch existing
  const { data: existing, error: selErr } = await supabase
    .from("league_months")
    .select("id")
    .eq("league", league)
    .eq("league_year", leagueYear)
    .eq("month_index", monthIndex)
    .single();

  if (existing && existing.id) return existing.id;

  // Insert if not found
  // If selErr is "no rows", insert; otherwise error
  const { data: inserted, error: insErr } = await supabase
    .from("league_months")
    .insert({ league, league_year: leagueYear, month_index: monthIndex })
    .select("id")
    .single();

  if (insErr) throw new Error("league_months insert failed: " + (insErr.message || "unknown"));
  return inserted.id;
}

export async function importMonthStandingsFromCSVText({
  league = CURRENT_SEASON,
  leagueYear,
  monthIndex,
  csvText
} = {}) {
  await requireModOrThrow();
  if (!csvText) throw new Error("Missing standings CSV text.");

  const monthId = await ensureLeagueMonth({ league, leagueYear, monthIndex });

  const rows = parseCSV(csvText);

  // Flexible column keys
  const EMAIL_KEYS = ["email", "player_email", "email_address"];
  const RANK_KEYS = ["rank", "standing", "place"];
  const PTS_KEYS = ["pts", "points", "score"];
  const OW_KEYS = ["ow", "ow_pct", "owp", "opp_win_pct", "opponent_win_pct"];
  const GW_KEYS = ["gw", "gw_pct", "gwp", "game_win_pct"];
  const OGW_KEYS = ["ogw", "ogw_pct", "ogwp", "opp_game_win_pct", "opponent_game_win_pct"];

  function pick(r, keys) {
    for (const k of keys) {
      if (r[k] !== undefined && String(r[k]).trim() !== "") return String(r[k]).trim();
    }
    return "";
  }

  const emails = [];
  const parsed = [];

  rows.forEach((r, idx) => {
    const email = normEmail(pick(r, EMAIL_KEYS));
    if (!email) return;
    emails.push(email);

    parsed.push({
      email,
      rank: parseInt(pick(r, RANK_KEYS) || "", 10),
      points: parseInt(pick(r, PTS_KEYS) || "0", 10) || 0,
      ow_pct: parseFloat(pick(r, OW_KEYS) || "") || null,
      gw_pct: parseFloat(pick(r, GW_KEYS) || "") || null,
      ogw_pct: parseFloat(pick(r, OGW_KEYS) || "") || null
    });
  });

  if (parsed.length === 0) throw new Error("No valid standings rows found.");

  const players = await fetchPlayersByEmail(emails);
  const byEmail = new Map(players.map(p => [normEmail(p.email), p]));

  // Validate
  for (const p of parsed) {
    if (!byEmail.has(p.email)) {
      throw new Error(`No players row found for email in standings: ${p.email}.`);
    }
  }

  // Upsert month_standings
  const toUpsert = parsed.map(p => ({
    month_id: monthId,
    player_id: byEmail.get(p.email).id,
    rank: Number.isFinite(p.rank) ? p.rank : null,
    points: p.points,
    ow_pct: p.ow_pct,
    gw_pct: p.gw_pct,
    ogw_pct: p.ogw_pct,
    tq: 0
  }));

  const { error: upErr } = await supabase
    .from("month_standings")
    .upsert(toUpsert, { onConflict: "month_id,player_id" });

  if (upErr) throw new Error("month_standings upsert failed: " + (upErr.message || "unknown"));

  return { monthId, rowsUpserted: toUpsert.length };
}

/* =========================================================
   4) MONTHLY POOLS + PAIRINGS (draft -> pairings table)
========================================================= */

export async function generateAndSaveMonthPairingsDraft({
  league = CURRENT_SEASON,
  leagueYear,
  monthIndex,
  roundsPerMonth = 4,
  // If you want to start month 1 with "no pools", pass usePools=false and provide rosterEmails
  usePools = true,
  rosterEmails = null
} = {}) {
  await requireModOrThrow();

  const monthId = await ensureLeagueMonth({ league, leagueYear, monthIndex });

  let standings = [];

  if (usePools) {
    const { data, error } = await supabase
      .from("month_standings")
      .select("player_id, rank, points, tq")
      .eq("month_id", monthId);

    if (error) throw new Error("month_standings fetch failed: " + (error.message || "unknown"));
    standings = data || [];
    if (standings.length === 0) throw new Error("No month_standings found for this month. Import standings first.");
  } else {
    // Month 1 mode: build standings array from rosterEmails (all rank null)
    if (!rosterEmails || rosterEmails.length === 0) {
      throw new Error("Month 1 mode requires rosterEmails.");
    }
    const players = await fetchPlayersByEmail(rosterEmails);
    const byEmail = new Map(players.map(p => [normEmail(p.email), p]));
    const missing = rosterEmails.map(normEmail).filter(e => !byEmail.has(e));
    if (missing.length) throw new Error("Missing players rows for roster emails: " + missing.join(", "));

    standings = rosterEmails.map(e => ({
      player_id: byEmail.get(normEmail(e)).id,
      rank: null,
      points: 0,
      tq: 0
    }));
  }

  // Generate pools + pairings
  const pools = usePools
    ? generatePools(standings, 8).map(p => ({
        poolIndex: p.poolIndex,
        members: p.members.map(m => ({ player_id: m.player_id }))
      }))
    : [
        { poolIndex: 1, members: standings.map(s => ({ player_id: s.player_id })) }
      ];

  const rounds = generateMonthlyPairings(pools, roundsPerMonth);

  // Decide global round numbers: (monthIndex-1)*roundsPerMonth + roundInMonth
  const baseRound = (monthIndex - 1) * roundsPerMonth;

  // Save drafts into pairings table (finalized=false)
  // We upsert by (league, round) behavior is not enforced by schema; we implement "delete then insert" for safety.
  for (const r of rounds) {
    const globalRound = baseRound + r.roundInMonth;

    // delete any existing draft for this league+round (safe)
    await supabase
      .from("pairings")
      .delete()
      .eq("league", league)
      .eq("round", globalRound);

    const payload = {
      league_year: leagueYear,
      month_index: monthIndex,
      round_in_month: r.roundInMonth,
      pairs: r.pairs,
      meta: {
        generated_at: new Date().toISOString(),
        use_pools: usePools
      }
    };

    const { error: insErr } = await supabase
      .from("pairings")
      .insert({
        league,
        round: globalRound,
        data: payload,
        finalized: false
      });

    if (insErr) throw new Error("pairings insert failed: " + (insErr.message || "unknown"));
  }

  return { monthId, roundsSaved: rounds.length };
}

export async function finalizeMonthPairings({
  league = CURRENT_SEASON,
  monthIndex,
  roundsPerMonth = 4
} = {}) {
  await requireModOrThrow();

  const baseRound = (monthIndex - 1) * roundsPerMonth;
  const minRound = baseRound + 1;
  const maxRound = baseRound + roundsPerMonth;

  const { error } = await supabase
    .from("pairings")
    .update({ finalized: true })
    .eq("league", league)
    .gte("round", minRound)
    .lte("round", maxRound);

  if (error) throw new Error("finalize pairings failed: " + (error.message || "unknown"));
  return { monthIndex, finalizedRounds: roundsPerMonth };
}

/* =========================================================
   5) TOURNAMENT PLACEMENTS -> TQ awards
   (Placement-only path; no Elo from externals unless match-by-match is also imported)
========================================================= */

export async function importTournamentPlacementsFromCSVText({
  name,
  eventDate,       // "YYYY-MM-DD"
  baseValue,       // 32000 / 24000 / 16000 etc
  fieldSize,       // optional; if omitted, computed from rows count
  source = "manual",
  csvText
} = {}) {
  await requireModOrThrow();

  if (!name || !eventDate || !baseValue) {
    throw new Error("name, eventDate, and baseValue are required for tournament import.");
  }
  if (!csvText) throw new Error("Missing tournament CSV text.");

  const rows = parseCSV(csvText);

  const EMAIL_KEYS = ["email", "player_email"];
  const RANK_KEYS = ["rank", "finish_rank", "place", "standing"];

  function pick(r, keys) {
    for (const k of keys) {
      if (r[k] !== undefined && String(r[k]).trim() !== "") return String(r[k]).trim();
    }
    return "";
  }

  const parsed = [];
  const emails = [];

  rows.forEach(r => {
    const email = normEmail(pick(r, EMAIL_KEYS));
    if (!email) return;
    const rank = parseInt(pick(r, RANK_KEYS) || "", 10);
    if (!rank || rank < 1) return;
    emails.push(email);
    parsed.push({ email, rank });
  });

  if (parsed.length === 0) throw new Error("No valid placements found.");

  const N = fieldSize ? parseInt(fieldSize, 10) : parsed.length;

  // Insert tournament row
  const { data: tour, error: tourErr } = await supabase
    .from("tournaments")
    .insert({
      name,
      event_date: eventDate,
      base_value: parseInt(baseValue, 10),
      source
    })
    .select("id")
    .single();

  if (tourErr) throw new Error("tournaments insert failed: " + (tourErr.message || "unknown"));

  const players = await fetchPlayersByEmail(emails);
  const byEmail = new Map(players.map(p => [normEmail(p.email), p]));

  // Validate
  for (const p of parsed) {
    if (!byEmail.has(p.email)) throw new Error(`No players row found for email: ${p.email}`);
  }

  const toInsert = parsed.map(p => {
    const tq = computeTQ(baseValue, p.rank, N);
    return {
      tournament_id: tour.id,
      player_id: byEmail.get(p.email).id,
      finish_rank: p.rank,
      tq_awarded: tq
    };
  });

  const { error: resErr } = await supabase.from("tournament_results").insert(toInsert);
  if (resErr) throw new Error("tournament_results insert failed: " + (resErr.message || "unknown"));

  return { tournamentId: tour.id, resultsInserted: toInsert.length };
}

export async function importExternalTournament({
  eventName,
  kValue,
  csvText
}) {
  const rows = csvText.trim().split("\n").slice(1);

  for (const line of rows) {
    const [pEmail, oEmail, result] = line.split(",");

    const { data: p } = await supabase
      .from("players")
      .select("*")
      .eq("email", pEmail.trim())
      .single();

    const { data: o } = await supabase
      .from("players")
      .select("*")
      .eq("email", oEmail.trim())
      .single();

    if (!p || !o) continue;

    const score =
      result === "win" ? 1 :
      result === "draw" ? 0.5 : 0;

    const expected =
      1 / (1 + Math.pow(10, (o.rating - p.rating) / 400));

    const delta = Math.round(kValue * (score - expected));

    await supabase
      .from("players")
      .update({ rating: p.rating + delta })
      .eq("id", p.id);

    await supabase
      .from("players")
      .update({ rating: o.rating - delta })
      .eq("id", o.id);

    await supabase.from("match_history").insert([
      {
        player_id: p.id,
        opponent_id: o.id,
        opponent_name: o.full_name,
        event_name: eventName,
        is_external: true,
        result,
        elo_delta: delta
      },
      {
        player_id: o.id,
        opponent_id: p.id,
        opponent_name: p.full_name,
        event_name: eventName,
        is_external: true,
        result: result === "win" ? "loss" : result === "loss" ? "win" : "draw",
        elo_delta: -delta
      }
    ]);
  }
}