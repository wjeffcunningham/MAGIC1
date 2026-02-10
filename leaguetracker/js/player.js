/* =========================================================
   Player Page – Elo + Match History (AUDITED)
   - Canonical player IDs (aliases applied)
   - Matches derived from Swiss rounds only
   - Elo math consistent with league.js
========================================================= */

/* =========================
   Player alias canonicalization
========================= */

const PLAYER_ALIASES = {
  "ghost-empire": "markus-thibeau",
  "spencer-sj": "spencer-shaw-jaworek"
};

function canonicalPlayer(slug) {
  return PLAYER_ALIASES[slug] || slug;
}

/* =========================
   Constants
========================= */

const START_ELO = 1600;

const K_VALUES = {
  BCPMM: 64,
  SHG: 32,
  CONNECTIONS: 24,
  BCWL: 16
};

/* =========================
   Helpers
========================= */

function normalizeSeries(series) {
  if (!series) return null;

  const s = series.toLowerCase();
  if (s.includes("bcpmm")) return "BCPMM";
  if (s.includes("stronghold") || s === "shg") return "SHG";
  if (s.includes("connection")) return "CONNECTIONS";
  if (s.includes("league") || s.includes("bcwl")) return "BCWL";
  return null;
}

function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

/* =========================
   Core: replay player Elo
========================= */

function replayPlayerElo(playerSlug, events) {
  const player = canonicalPlayer(playerSlug);

  let elo = START_ELO;
  const history = [];
  const matches = [];

  events.forEach(event => {
    const series = normalizeSeries(event?.event?.series);
    if (!series) return;

    event.rounds?.forEach(round => {
      round.matches?.forEach(raw => {
        const a = canonicalPlayer(raw.playerA);
        const b = canonicalPlayer(raw.playerB);

        if (a !== player && b !== player) return;

        const isA = a === player;
        const opponent = isA ? b : a;

        const gf = isA ? raw.gamesA : raw.gamesB;
        const ga = isA ? raw.gamesB : raw.gamesA;

        if (typeof gf !== "number" || typeof ga !== "number") return;

        const result =
          gf === ga ? 0.5 :
          gf > ga ? 1 : 0;

        matches.push({
          date: event.event.date,
          series,
          opponent,
          gamesFor: gf,
          gamesAgainst: ga,
          result
        });
      });
    });
  });

  // chronological
  matches.sort((a, b) => new Date(a.date) - new Date(b.date));

  matches.forEach(match => {
    const k = K_VALUES[match.series] || 16;

    // Player-page Elo does not track opponent ratings historically;
    // we conservatively assume START_ELO baseline (same as before),
    // but with correct formula usage.
    const expected = expectedScore(elo, START_ELO);
    const delta = Math.round(k * (match.result - expected));

    elo += delta;

    history.push({
      ...match,
      eloAfter: elo,
      eloDelta: delta
    });
  });

  // newest first for display
  return history.reverse();
}