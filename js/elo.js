// /js/elo.js
// Universal ELO support with draws

export function computeElo(rA, rB, scoreA, K) {
  const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const expectedB = 1 - expectedA;

  const scoreB = 1 - scoreA;

  const newA = Math.round(rA + K * (scoreA - expectedA));
  const newB = Math.round(rB + K * (scoreB - expectedB));

  return {
    newA,
    newB,
    deltaA: newA - rA,
    deltaB: newB - rB,
  };
}

export function scoreFromResult(result) {
  switch (result) {
    case "A_WIN": return 1;
    case "B_WIN": return 0;
    case "DRAW":  return 0.5;
    default:
      throw new Error("Invalid match result flag: " + result);
  }
}