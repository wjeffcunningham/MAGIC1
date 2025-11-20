// Simple Elo helper for head-to-head matches

export function computeElo(aRating, bRating, winner, kFactor = 24) {
  // winner: "A" or "B"
  const qa = Math.pow(10, aRating / 400);
  const qb = Math.pow(10, bRating / 400);
  const ea = qa / (qa + qb);
  const eb = qb / (qa + qb);

  let sa = winner === "A" ? 1 : 0;
  let sb = winner === "B" ? 1 : 0;

  const newA = Math.round(aRating + kFactor * (sa - ea));
  const newB = Math.round(bRating + kFactor * (sb - eb));

  return { newA, newB, deltaA: newA - aRating, deltaB: newB - bRating };
}