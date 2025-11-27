// js/pairings-utils.js
//
// Given a list of players in a pod, generate up to 4 opponents per player.
// No self-pairings, no duplicates, no rounds.
//
// INPUT: players = [ { id, full_name, home_store } ]
// OUTPUT: [ { player_a: id, player_b: id } ]
//
// No DB. Pure function.
//

/**
 * Simple seeded shuffle for deterministic ordering.
 */
function seededShuffle(arr, seedString = null) {
  const result = [...arr];
  let seed =
    seedString != null
      ? [...seedString].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      : Date.now();

  function nextRand() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate pairings for a single pod.
 * players: [{ id, full_name, home_store }]
 * maxMatchesPerPlayer: usually 4
 */
export function generatePairingsForPod(players, maxMatchesPerPlayer = 4, seed = "") {
  const n = players.length;
  if (n < 2) return [];

  const order = seededShuffle(players, seed);

  // Track how many matches each player has, and who they've played
  const matchCounts = new Map();
  const opponentsMap = new Map();
  for (const p of order) {
    matchCounts.set(p.id, 0);
    opponentsMap.set(p.id, new Set());
  }

  const matches = [];
  let iterations = 0;
  const maxIterations = n * maxMatchesPerPlayer * 4;

  function canPlay(aId, bId) {
    if (aId === bId) return false;
    if (matchCounts.get(aId) >= maxMatchesPerPlayer) return false;
    if (matchCounts.get(bId) >= maxMatchesPerPlayer) return false;
    if (opponentsMap.get(aId).has(bId)) return false;
    return true;
  }

  while (iterations++ < maxIterations) {
    let progress = false;

    for (const p of order) {
      const pId = p.id;
      if (matchCounts.get(pId) >= maxMatchesPerPlayer) continue;

      // Candidates sorted by current match count (aim to balance)
      const candidates = order
        .filter((q) => q.id !== pId)
        .filter((q) => canPlay(pId, q.id))
        .sort(
          (a, b) =>
            matchCounts.get(a.id) - matchCounts.get(b.id)
        );

      if (!candidates.length) continue;

      const partner = candidates[0];
      const aId = pId;
      const bId = partner.id;

      // Add match
      matches.push({ player_a: aId, player_b: bId });

      matchCounts.set(aId, matchCounts.get(aId) + 1);
      matchCounts.set(bId, matchCounts.get(bId) + 1);

      opponentsMap.get(aId).add(bId);
      opponentsMap.get(bId).add(aId);

      progress = true;
    }

    if (!progress) break;
  }

  return matches;
}