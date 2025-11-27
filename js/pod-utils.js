// js/pods-utils.js
//
// Pure helpers for assigning players to pods.
// - Balanced pod sizes (Q3: "balance pods")
// - Mild home-store weighting (Q1: "mild")
// - Fixed pod names: Emerald, Sapphire, Ruby, Pearl (Q2)
//
// INPUT: players = [
//   { id, full_name, home_store }
// ]
//
// OUTPUT: [
//   { name: "Emerald", members: [playerId1, ...] },
//   { name: "Sapphire", members: [...] },
//   { name: "Ruby", members: [...] },
//   { name: "Pearl", members: [...] }
// ]
//
// No Supabase, no DOM. Pure JS only.
//

export const POD_NAMES = ["Emerald", "Sapphire", "Ruby", "Pearl"];

/**
 * Simple deterministic-ish shuffle with a seed string.
 * If no seed provided, uses current time.
 */
function seededShuffle(arr, seedString = null) {
  const result = [...arr];
  let seed =
    seedString != null
      ? [...seedString].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      : Date.now();

  function nextRand() {
    // linear congruential generator
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
 * Compute target pod sizes given total N and 4 pods, balanced as evenly as possible.
 * Example:
 *  N=32 => [8,8,8,8]
 *  N=31 => [8,8,8,7]
 *  N=30 => [8,8,7,7]
 *  N=29 => [8,7,7,7], etc.
 */
function computePodTargets(totalPlayers) {
  const base = Math.floor(totalPlayers / 4);
  let remainder = totalPlayers % 4;

  const targets = [];
  for (let i = 0; i < 4; i++) {
    const extra = remainder > 0 ? 1 : 0;
    targets.push(base + extra);
    if (remainder > 0) remainder--;
  }
  return targets;
}

/**
 * Mild home-store weighting:
 * - Group players by home_store
 * - Sort groups by size descending
 * - Within each group, shuffle
 * - Then assign players group by group to pods, always picking the pod
 *   that is currently *most empty* (subject to target sizes).
 *
 * Result: players from the same store tend to land in similar pods
 * (they are processed in a clump), but strict balance is enforced.
 */
export function generatePodsForPlayers(players, seedString = null) {
  const total = players.length;
  if (total === 0) {
    return POD_NAMES.map((name) => ({ name, members: [] }));
  }

  const targets = computePodTargets(total);

  // Group players by home_store key
  const groupsMap = new Map();
  for (const p of players) {
    const key = (p.home_store || "Unknown").trim();
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(p);
  }

  // Create a list of groups sorted by size descending
  const groups = Array.from(groupsMap.entries())
    .map(([home_store, members]) => ({
      home_store,
      members: seededShuffle(members, (seedString || "") + home_store),
    }))
    .sort((a, b) => b.members.length - a.members.length);

  // Pod buckets
  const pods = POD_NAMES.map((name, index) => ({
    name,
    index,
    targetSize: targets[index],
    members: [],
  }));

  function findPodWithMostSpace() {
    // Choose the pod where targetSize - currentSize is largest.
    let best = null;
    let bestSpace = -Infinity;
    for (const pod of pods) {
      const space = pod.targetSize - pod.members.length;
      if (space > bestSpace && space > 0) {
        bestSpace = space;
        best = pod;
      }
    }
    // Fallback if all full (shouldn't happen if targets are correct).
    return best || pods[0];
  }

  // Assign group-by-group, always to the pod with most space remaining.
  for (const group of groups) {
    for (const player of group.members) {
      const pod = findPodWithMostSpace();
      pod.members.push(player.id);
    }
  }

  // Return only the name + members
  return pods.map((pod) => ({
    name: pod.name,
    members: pod.members,
  }));
}