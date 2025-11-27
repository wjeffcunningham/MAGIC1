// /js/elo.js
//
// Pure Elo helpers, no Supabase calls.

export function calculateEloDelta(ratingA, ratingB, scoreA, k) {
  // ratingA, ratingB: ints
  // scoreA: 1 (win), 0.5 (draw), 0 (loss)
  // k: K-factor (16 for BCWL league)
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const deltaA = Math.round(k * (scoreA - expectedA));
  return deltaA;
}

export function applyElo(ratingA, ratingB, scoreA, k) {
  const deltaA = calculateEloDelta(ratingA, ratingB, scoreA, k);
  const newA = ratingA + deltaA;
  const newB = ratingB - deltaA;
  return {
    newA,
    newB,
    deltaA,
    deltaB: -deltaA,
  };
}
