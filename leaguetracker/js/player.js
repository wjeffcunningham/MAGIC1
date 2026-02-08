const START_ELO = 1600;

const K_VALUES = {
  BCPMM: 64,
  SHG: 32,
  CONNECTIONS: 24,
  BCWL: 16
};

function normalizeSeries(series) {
  if (!series) return null;

  const s = series.toLowerCase();
  if (s.includes('bcpmm')) return 'BCPMM';
  if (s.includes('stronghold') || s === 'shg') return 'SHG';
  if (s.includes('connection')) return 'CONNECTIONS';
  if (s.includes('league') || s.includes('bcwl')) return 'BCWL';
  return null;
}

function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

function replayPlayerElo(playerSlug, events) {
  let elo = START_ELO;
  const history = [];
  const matches = [];

  events.forEach(event => {
    const series = normalizeSeries(event.event.series);
    if (!series) return;

    event.rounds?.forEach(round => {
      round.matches?.forEach(match => {
        if (![match.playerA, match.playerB].includes(playerSlug)) return;

        const isA = match.playerA === playerSlug;
        const opponent = isA ? match.playerB : match.playerA;
        const gf = isA ? match.gamesA : match.gamesB;
        const ga = isA ? match.gamesB : match.gamesA;

        const result = gf === ga ? 0.5 : gf > ga ? 1 : 0;

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

  matches.sort((a, b) => new Date(a.date) - new Date(b.date));

  matches.forEach(match => {
    const k = K_VALUES[match.series] || 16;
    const expected = expectedScore(elo, START_ELO);
    const delta = Math.round(k * (match.result - expected));
    elo += delta;

    history.push({
      ...match,
      eloAfter: elo,
      eloDelta: delta
    });
  });

  return history.reverse();
}