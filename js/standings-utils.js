// /js/standings-utils.js
//
// Compute BCWL league standings for a given set of *approved* league_matches
// and players.
//
// This module does only math / aggregation. No Supabase calls.
//
// Assumptions:
// - League points: Win = 3, Draw = 1, Loss = 0, BYE = 3 (no rating change).
// - "Game Win %" from the spec is implemented as match win percentage:
//       (wins + 0.5 * draws) / totalMatches
// - OMW% = average of opponents' match win percentages (raw, no 40% floor).
// - Draw detection: player_b != null, winner is null, notes starts with "DRAW".
// - BYE detection: player_b is null; winner = player_a.
// - Competitive Win % is present in the data model but currently 0/unused
//   until event matches are wired in. The comparator only uses it when
//   both players have compMatches > 0.

/**
 * Build a fast lookup from player_id to a basic player info object.
 */
function buildPlayerLookup(players) {
  const map = {};
  for (const p of players || []) {
    map[p.id] = {
      id: p.id,
      full_name: p.full_name,
      rating: p.rating,
      home_store: p.home_store || null
    };
  }
  return map;
}

/**
 * Determine if a league match row is a draw.
 * We treat it as a draw when:
 * - player_b is not null
 * - winner is null
 * - notes starts with "DRAW"
 */
function isDrawMatch(m) {
  if (!m) return false;
  if (m.player_b === null) return false;
  if (m.winner) return false;
  if (!m.notes) return false;
  return m.notes.startsWith("DRAW");
}

/**
 * Determine if a league match row is a BYE.
 * We treat BYE as:
 * - player_b is null
 * - winner = player_a (after approval)
 */
function isByeMatch(m) {
  if (!m) return false;
  return m.player_b === null;
}

/**
 * Aggregate league stats per player from approved league_matches for a given
 * scope (e.g. a single month).
 *
 * matches: array of league_matches rows (approved = true)
 * players: array of players rows
 *
 * Returns:
 *   statsMap: { [playerId]: { ...stats } }
 */
export function computeLeagueStats(matches, players) {
  const playerLookup = buildPlayerLookup(players);

  const statsMap = {};

  function ensureStats(id) {
    if (!statsMap[id]) {
      const p = playerLookup[id];
      statsMap[id] = {
        player_id: id,
        full_name: p?.full_name || "(Unknown)",
        rating: p?.rating ?? 1600,
        home_store: p?.home_store || null,

        // league match counts
        wins: 0,
        losses: 0,
        draws: 0,
        matches: 0,
        points: 0, // 3/1/0, BYE = 3

        // opponents for OMW%
        opponents: new Set(),

        // competitive matches (for Tiebreaker #1) — to be wired later
        compWins: 0,
        compMatches: 0
      };
    }
    return statsMap[id];
  }

  for (const m of matches || []) {
    const isBye = isByeMatch(m);
    const isDraw = isDrawMatch(m);

    const aId = m.player_a;
    const bId = m.player_b;

    if (!aId) continue;

    const aStats = ensureStats(aId);

    if (isBye) {
      // BYE: A gets 3 points, 1 "match win", 1 match. No opponent added.
      aStats.wins += 1;
      aStats.matches += 1;
      aStats.points += 3;
      continue;
    }

    if (!bId) continue; // malformed row

    const bStats = ensureStats(bId);

    // Track opponent relationships for OMW%
    aStats.opponents.add(bId);
    bStats.opponents.add(aId);

    if (isDraw) {
      aStats.draws += 1;
      bStats.draws += 1;
      aStats.matches += 1;
      bStats.matches += 1;
      aStats.points += 1;
      bStats.points += 1;
      continue;
    }

    // Normal win/loss
    if (!m.winner) {
      // no winner set yet; skip (shouldn't be in "approved" set, but be safe)
      continue;
    }

    const wId = m.winner;
    const loserId = wId === aId ? bId : aId;

    const wStats = ensureStats(wId);
    const lStats = ensureStats(loserId);

    wStats.wins += 1;
    lStats.losses += 1;
    wStats.matches += 1;
    lStats.matches += 1;
    wStats.points += 3;
  }

  // Finalize derived stats
  for (const id of Object.keys(statsMap)) {
    const s = statsMap[id];

    // Match Win % (your "Game Win %" tiebreaker #2)
    if (s.matches > 0) {
      s.matchWinPct = (s.wins + 0.5 * s.draws) / s.matches;
    } else {
      s.matchWinPct = 0;
    }

    // Competitive Win % — currently zero/unset until we add event matches.
    if (s.compMatches > 0) {
      s.compWinPct = s.compWins / s.compMatches;
    } else {
      s.compWinPct = null; // important: null => "no competitive data"
    }
  }

  // Compute Opponents' Match Win % (OMW)
  for (const id of Object.keys(statsMap)) {
    const s = statsMap[id];
    const oppIds = Array.from(s.opponents);

    if (!oppIds.length) {
      s.omw = null; // no opponents => undefined tiebreaker
      continue;
    }

    let sum = 0;
    let count = 0;

    for (const oppId of oppIds) {
      const opp = statsMap[oppId];
      if (!opp) continue;
      // If opponent has 0 matches, their MWP is 0.
      sum += opp.matches > 0 ? (opp.wins + 0.5 * opp.draws) / opp.matches : 0;
      count++;
    }

    if (count === 0) {
      s.omw = null;
    } else {
      s.omw = sum / count; // raw, no 40% floor
    }
  }

  return statsMap;
}

/**
 * Transform statsMap into a sorted array according to BCWL rules:
 *
 * 1) League points (descending)
 * 2) Competitive Win % (only if BOTH players have compMatches > 0)
 * 3) Match Win % (descending)
 * 4) OMW% (descending)
 * 5) Rating (descending) as a final stability tiebreaker
 */
export function sortStandings(statsMap) {
  const rows = Object.values(statsMap || {});

  rows.sort((a, b) => {
    // 1) League points
    if (a.points !== b.points) {
      return b.points - a.points;
    }

    // 2) Competitive Win % — only if BOTH have compMatches > 0
    if (a.compMatches > 0 && b.compMatches > 0) {
      if (a.compWinPct !== b.compWinPct) {
        return (b.compWinPct ?? 0) - (a.compWinPct ?? 0);
      }
    }

    // 3) Match Win % (your "Game Win %" tiebreaker #2)
    if (a.matchWinPct !== b.matchWinPct) {
      return (b.matchWinPct ?? 0) - (a.matchWinPct ?? 0);
    }

    // 4) OMW%
    const aO = a.omw ?? -1;
    const bO = b.omw ?? -1;
    if (aO !== bO) {
      return bO - aO;
    }

    // 5) Rating (final stabilizer)
    if (a.rating !== b.rating) {
      return (b.rating ?? 0) - (a.rating ?? 0);
    }

    // Stable tie-breaker: alphabetical by name
    return (a.full_name || "").localeCompare(b.full_name || "");
  });

  return rows;
}
