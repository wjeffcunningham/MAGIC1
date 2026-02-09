/* =========================================================
   League Tracker – Core Logic (Robust + Elimination + Elo)
   - Tabs: "bcpmm" | "league" | "elo"
   - Elo computed globally (all matches), zero-sum
   - Includes Swiss + ALL elimination matches (robust walker)
   - Adds win-streak 🔥 and champion 🏆 markers
========================================================= */

const EVENT_PATHS = [
  "/leaguetracker/data/raw/events/bcpmm-2026-01-10.json",
  "/leaguetracker/data/raw/events/connections-2026-01-12.json",
  "/leaguetracker/data/raw/events/connections-2026-01-26.json",
  "/leaguetracker/data/raw/events/stronghold-2026-02-01.json",
  "/leaguetracker/data/raw/events/bcwl-2026-01-26-r1.json",
  "/leaguetracker/data/raw/events/bcwl-2026-02-02-r2.json"
];

const ladderBody = document.getElementById("ladder-body");
const tabs = document.querySelectorAll(".tabs button");

let events = [];
let currentMode = "bcpmm";

/* =========================================================
   Constants (Badges)
========================================================= */

const START_ELO = 1600;
const WIN_STREAK_THRESHOLD = 3;
const BCPMM_CHAMPION = "caitlyn-bethune";

/* =========================================================
   Load events
========================================================= */

async function loadEvents() {
  events = [];

  for (const path of EVENT_PATHS) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      events.push(await res.json());
    } catch {
      console.warn("[LeagueTracker] Skipped:", path);
    }
  }

  render();
}

/* =========================================================
   Helpers
========================================================= */

function slugToName(slug) {
  return (slug || "").replace(/-/g, " ");
}

function getPointMultiplier(series) {
  return (
    {
      BCPMM: 6,
      SHG: 3,
      Connections: 2,
      BCWL: 1
    }[series] ?? 1
  );
}

function getKValue(series) {
  return (
    {
      BCPMM: 64,
      SHG: 32,
      Connections: 24,
      BCWL: 16
    }[series] ?? 16
  );
}

function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

/* =========================================================
   Normalize match-like objects
========================================================= */

function normalizeMatchLike(node) {
  if (!node || typeof node !== "object") return null;

  const a = node.playerA ?? node.player1 ?? node.p1 ?? null;
  const b = node.playerB ?? node.player2 ?? node.p2 ?? null;
  if (!a || !b) return null;

  return {
    playerA: a,
    playerB: b,
    gamesA: node.gamesA ?? node.games1 ?? null,
    gamesB: node.gamesB ?? node.games2 ?? null,
    winner: node.winner ?? null,
    result: node.result ?? null
  };
}

function scoreAFromMatch(m) {
  if (m.result === "D") return 0.5;

  if (typeof m.gamesA === "number" && typeof m.gamesB === "number") {
    if (m.gamesA === m.gamesB) return 0.5;
    return m.gamesA > m.gamesB ? 1 : 0;
  }

  if (m.winner) return m.winner === m.playerA ? 1 : 0;
  return null;
}

/* =========================================================
   Collect matches (Swiss + Elimination)
========================================================= */

function collectMatches(event) {
  const out = [];

  for (const round of event.rounds || []) {
    for (const raw of round.matches || []) {
      const m = normalizeMatchLike(raw);
      if (m) out.push(m);
    }
  }

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "object") {
      const m = normalizeMatchLike(node);
      if (m) {
        out.push(m);
        return;
      }
      Object.values(node).forEach(walk);
    }
  }

  walk(event.elimination);
  return out;
}

/* =========================================================
   Streaks + Elo (computed once, reused by multiple tabs)
========================================================= */

function computeEloAndStreaks() {
  const ratings = {};
  const recentResults = {}; // player -> [bool wins]

  function ensure(p) {
    if (!(p in ratings)) ratings[p] = START_ELO;
    if (!(p in recentResults)) recentResults[p] = [];
  }

  function pushResult(player, isWin) {
    recentResults[player].push(isWin);
    if (recentResults[player].length > WIN_STREAK_THRESHOLD) {
      recentResults[player].shift();
    }
  }

  const ordered = [...events].sort(
    (a, b) => new Date(a.event.date) - new Date(b.event.date)
  );

  for (const event of ordered) {
    const K = getKValue(event?.event?.series);

    for (const m of collectMatches(event)) {
      const Sa = scoreAFromMatch(m);
      if (Sa === null) continue;

      ensure(m.playerA);
      ensure(m.playerB);

      const Ra = ratings[m.playerA];
      const Rb = ratings[m.playerB];
      const Ea = expectedScore(Ra, Rb);
      const deltaA = K * (Sa - Ea);

      ratings[m.playerA] = Ra + deltaA;
      ratings[m.playerB] = Rb - deltaA;

      // streaks: only count wins (draw/loss break the streak)
      pushResult(m.playerA, Sa === 1);
      pushResult(m.playerB, Sa === 0);
    }
  }

  const streakMap = {};
  Object.keys(recentResults).forEach(p => {
    const r = recentResults[p];
    streakMap[p] =
      Array.isArray(r) &&
      r.length === WIN_STREAK_THRESHOLD &&
      r.every(Boolean);
  });

  const eloRows = Object.entries(ratings)
    .map(([player, value]) => ({
      player,
      value: Math.round(value),
      streak: !!streakMap[player]
    }))
    .sort((a, b) => b.value - a.value);

  return { eloRows, streakMap };
}

/* =========================================================
   Points Race (BCPMM)
========================================================= */

function computePointsRace(streakMap) {
  const totals = {};

  for (const event of events) {
    const mult = getPointMultiplier(event?.event?.series);

    if (event.standings) {
      for (const row of event.standings) {
        totals[row.player] =
          (totals[row.player] || 0) + row.match_points * mult;
      }
    }
  }

  return Object.entries(totals)
    .map(([player, value]) => ({
      player,
      value,
      streak: !!streakMap[player]
    }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   League standings (latest BCWL)
========================================================= */

function computeLatestLeagueStandings() {
  const league = [...events]
    .filter(e => e?.event?.series === "BCWL")
    .sort((a, b) => new Date(b.event.date) - new Date(a.event.date))[0];

  if (!league || !league.standings) return [];

  return league.standings
    .map(r => ({ player: r.player, value: r.match_points }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   Render
========================================================= */

function render() {
  ladderBody.innerHTML = "";

  const { eloRows, streakMap } = computeEloAndStreaks();

  let rows = [];
  if (currentMode === "bcpmm") rows = computePointsRace(streakMap);
  if (currentMode === "league") rows = computeLatestLeagueStandings();
  if (currentMode === "elo") rows = eloRows;

  rows.forEach((r, i) => {
    const showFire = (currentMode === "bcpmm" || currentMode === "elo") && r.streak;
    const fire = showFire ? " 🔥" : "";

    const trophy =
      currentMode === "bcpmm" && r.player === BCPMM_CHAMPION ? " 🏆" : "";

    ladderBody.insertAdjacentHTML(
      "beforeend",
      `
      <tr>
        <td class="rank">${i + 1}</td>
        <td class="player">
          <a href="./player.html?player=${r.player}">
            ${slugToName(r.player)}
          </a>${fire}${trophy}
        </td>
        <td class="num">${r.value}</td>
      </tr>
      `
    );
  });
}

/* =========================================================
   Tabs
========================================================= */

tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
    render();
  });
});

loadEvents();