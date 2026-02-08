/* =========================================================
   League Tracker – Core Logic (Corrected)
   ========================================================= */

const EVENT_PATHS = [
  '/leaguetracker/data/raw/events/bcpmm-2026-01-10.json',
  '/leaguetracker/data/raw/events/connections-2026-01-12.json',
  '/leaguetracker/data/raw/events/connections-2026-01-26.json',
  '/leaguetracker/data/raw/events/stronghold-2026-02-01.json',
  '/leaguetracker/data/raw/events/bcwl-2026-01-26-r1.json',
  '/leaguetracker/data/raw/events/bcwl-2026-02-02-r2.json'
];

const ladderBody = document.getElementById('ladder-body');
const tabs = document.querySelectorAll('.tabs button');

let events = [];
let currentMode = 'bcpmm';

/* =========================================================
   Load events
   ========================================================= */

async function loadEvents() {
  events = [];

  for (const path of EVENT_PATHS) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error('404');
      events.push(await res.json());
    } catch {
      console.warn('[LeagueTracker] Skipped:', path);
    }
  }

  console.log('[LeagueTracker] Loaded events:', events.length);
  render();
}

/* =========================================================
   Helpers
   ========================================================= */

function slugToName(slug) {
  return slug.replace(/-/g, ' ');
}

function getPointMultiplier(series) {
  return {
    BCPMM: 6,
    SHG: 3,
    Connections: 2,
    BCWL: 1
  }[series] ?? 1;
}

function getKValue(series) {
  return {
    BCPMM: 64,
    SHG: 32,
    Connections: 24,
    BCWL: 16
  }[series] ?? 16;
}

function matchPoints(gA, gB, result) {
  if (result === 'D') return [1, 1];
  if (gA === gB) return [1, 1];
  return gA > gB ? [3, 0] : [0, 3];
}

/* =========================================================
   Points Race (weighted)
   ========================================================= */

function computePointsRace() {
  const totals = {};

  for (const event of events) {
    const mult = getPointMultiplier(event.event.series);

    if (event.standings) {
      for (const row of event.standings) {
        totals[row.player] =
          (totals[row.player] || 0) + row.match_points * mult;
      }
      continue;
    }

    // derive from rounds
    for (const round of event.rounds || []) {
      for (const m of round.matches || []) {
        if (!m.playerA || !m.playerB) continue;
        const [pa, pb] = matchPoints(m.gamesA, m.gamesB, m.result);
        totals[m.playerA] = (totals[m.playerA] || 0) + pa * mult;
        totals[m.playerB] = (totals[m.playerB] || 0) + pb * mult;
      }

      for (const bye of round.byes || []) {
        totals[bye] = (totals[bye] || 0) + 3 * mult;
      }
    }
  }

  return Object.entries(totals)
    .map(([player, value]) => ({ player, value }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   League (most recent BCWL standings)
   ========================================================= */

function computeLatestLeagueStandings() {
  const league = events
    .filter(e => e.event.series === 'BCWL')
    .sort((a, b) => new Date(b.event.date) - new Date(a.event.date))[0];

  if (!league || !league.standings) return [];

  return league.standings
    .map(r => ({ player: r.player, value: r.match_points }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   Elo (global replay)
   ========================================================= */

function computeElo() {
  const ratings = {};

  function ensure(p) {
    if (!(p in ratings)) ratings[p] = 1600;
  }

  const ordered = [...events].sort(
    (a, b) => new Date(a.event.date) - new Date(b.event.date)
  );

  for (const event of ordered) {
    const K = getKValue(event.event.series);

    for (const round of event.rounds || []) {
      for (const m of round.matches || []) {
        if (!m.playerA || !m.playerB) continue;

        ensure(m.playerA);
        ensure(m.playerB);

        const Ra = ratings[m.playerA];
        const Rb = ratings[m.playerB];

        const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
        const [pa] = matchPoints(m.gamesA, m.gamesB, m.result);
        const Sa = pa === 3 ? 1 : pa === 1 ? 0.5 : 0;

        ratings[m.playerA] = Ra + K * (Sa - Ea);
        ratings[m.playerB] = Rb + K * ((1 - Sa) - (1 - Ea));
      }
    }
  }

  return Object.entries(ratings)
    .map(([player, value]) => ({ player, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   Render
   ========================================================= */

function render() {
  ladderBody.innerHTML = '';
  let rows = [];

  if (currentMode === 'bcpmm') rows = computePointsRace();
  if (currentMode === 'league_month') rows = computeLatestLeagueStandings();
  if (currentMode === 'elo') rows = computeElo();

  if (!rows.length) {
    ladderBody.innerHTML =
      `<tr><td colspan="3" class="empty">No data available</td></tr>`;
    return;
  }

  rows.forEach((r, i) => {
    ladderBody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${i + 1}</td>
        <td><a href="./player.html?player=${r.player}">
          ${slugToName(r.player)}</a></td>
        <td class="num">${r.value}</td>
      </tr>
    `);
  });
}

/* =========================================================
   Tabs
   ========================================================= */

tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    render();
  });
});

loadEvents();