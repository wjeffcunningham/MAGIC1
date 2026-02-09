/* =========================================================
   League Tracker – Core Logic (Robust + Elimination + Elo)
   - Tabs: "bcpmm" | "league" | "elo"
   - Elo computed globally (all matches), zero-sum
   - Includes Swiss + ALL elimination matches (robust walker)
   - Adds debug logs so you can confirm elim matches were counted
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

  // Debug: confirm elimination exists in the BCPMM event (if present)
  const bcpmm = events.find(e => e?.event?.series === "BCPMM");
  if (bcpmm) {
    const { swissCount, elimCount, total } = countMatches(bcpmm);
    console.log("[LeagueTracker] BCPMM match counts:", { swissCount, elimCount, total });
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

/* Points helper (for points race if standings missing) */
function matchPoints(gA, gB, result) {
  if (result === "D") return [1, 1];
  if (typeof gA === "number" && typeof gB === "number" && gA === gB) return [1, 1];
  return gA > gB ? [3, 0] : [0, 3];
}

/* =========================================================
   Normalize “match-like” objects (Swiss + elim variance)
========================================================= */

function normalizeMatchLike(node) {
  if (!node || typeof node !== "object") return null;

  // common variants we’ll accept
  const a =
    node.playerA ?? node.player1 ?? node.p1 ?? node.a ?? node.A ?? null;
  const b =
    node.playerB ?? node.player2 ?? node.p2 ?? node.b ?? node.B ?? null;

  if (!a || !b) return null;

  // normalize game fields too, if they vary
  const gamesA =
    node.gamesA ?? node.games1 ?? node.g1 ?? node.scoreA ?? null;
  const gamesB =
    node.gamesB ?? node.games2 ?? node.g2 ?? node.scoreB ?? null;

  const winner = node.winner ?? node.win ?? null;
  const result = node.result ?? node.outcome ?? null;

  return {
    ...node,
    playerA: a,
    playerB: b,
    gamesA,
    gamesB,
    winner,
    result
  };
}

/* Elo score Sa (1 / 0.5 / 0) for playerA from a normalized match */
function scoreAFromMatch(m) {
  // explicit draw flag
  if (m.result === "D") return 0.5;

  // numeric games
  if (typeof m.gamesA === "number" && typeof m.gamesB === "number") {
    if (m.gamesA === m.gamesB) return 0.5;
    return m.gamesA > m.gamesB ? 1 : 0;
  }

  // winner field
  if (m.winner) {
    return m.winner === m.playerA ? 1 : 0;
  }

  return null; // insufficient info
}

/* =========================================================
   Collect ALL matches (Swiss + Robust Elimination)
========================================================= */

function collectMatches(event) {
  const swiss = [];
  const elim = [];

  // Swiss rounds (expected structure)
  for (const round of event.rounds || []) {
    for (const raw of round.matches || []) {
      const m = normalizeMatchLike(raw);
      if (m) swiss.push(m);
    }
  }

  // Elimination (walk ANY nested structure)
  function walk(node) {
    if (!node) return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    if (typeof node === "object") {
      const m = normalizeMatchLike(node);
      if (m) {
        elim.push(m);
        return;
      }
      for (const v of Object.values(node)) walk(v);
    }
  }

  walk(event.elimination);

  // Debug: if you’re missing elim in Elo, this number will reveal it.
  // (Only logs for BCPMM to avoid spam)
  if (event?.event?.series === "BCPMM") {
    console.log("[LeagueTracker] collectMatches(BCPMM):", {
      swiss: swiss.length,
      elim: elim.length,
      total: swiss.length + elim.length
    });
  }

  return swiss.concat(elim);
}

function countMatches(event) {
  let swissCount = 0;
  let elimCount = 0;

  for (const round of event.rounds || []) {
    for (const raw of round.matches || []) {
      if (normalizeMatchLike(raw)) swissCount++;
    }
  }

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "object") {
      if (normalizeMatchLike(node)) {
        elimCount++;
        return;
      }
      Object.values(node).forEach(walk);
    }
  }

  walk(event.elimination);
  return { swissCount, elimCount, total: swissCount + elimCount };
}

/* =========================================================
   Points Race (weighted)
========================================================= */

function computePointsRace() {
  const totals = {};

  for (const event of events) {
    const mult = getPointMultiplier(event?.event?.series);

    if (event.standings) {
      for (const row of event.standings) {
        totals[row.player] = (totals[row.player] || 0) + row.match_points * mult;
      }
      continue;
    }

    // derive if standings missing
    for (const round of event.rounds || []) {
      for (const raw of round.matches || []) {
        const m = normalizeMatchLike(raw);
        if (!m) continue;
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
  const league = [...events]
    .filter(e => e?.event?.series === "BCWL")
    .sort((a, b) => new Date(b.event.date) - new Date(a.event.date))[0];

  if (!league || !league.standings) return [];

  return league.standings
    .map(r => ({ player: r.player, value: r.match_points }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   Elo (global replay, zero-sum, includes elimination)
========================================================= */

function computeElo() {
  const ratings = {};
  const START = 1600;

  function ensure(p) {
    if (!(p in ratings)) ratings[p] = START;
  }

  const ordered = [...events].sort(
    (a, b) => new Date(a.event.date) - new Date(b.event.date)
  );

  for (const event of ordered) {
    const K = getKValue(event?.event?.series);

    const allMatches = collectMatches(event);

    for (const m of allMatches) {
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
    }
  }

  const rows = Object.entries(ratings)
    .map(([player, value]) => ({ player, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  // Debug: print top few Elo so you can compare quickly with player pages
  console.log("[LeagueTracker] Elo top 10:", rows.slice(0, 10));

  return rows;
}

/* =========================================================
   Render
========================================================= */

function render() {
  ladderBody.innerHTML = "";
  let rows = [];

  if (currentMode === "bcpmm") rows = computePointsRace();
  if (currentMode === "league") rows = computeLatestLeagueStandings();
  if (currentMode === "elo") rows = computeElo();

  if (!rows.length) {
    ladderBody.innerHTML = `<tr><td colspan="3" class="empty">No data available</td></tr>`;
    return;
  }

  rows.forEach((r, i) => {
    ladderBody.insertAdjacentHTML(
      "beforeend",
      `
      <tr>
        <td class="rank">${i + 1}</td>
        <td class="player">
          <a href="./player.html?player=${r.player}">${slugToName(r.player)}</a>
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
    currentMode = btn.dataset.mode; // "bcpmm" | "league" | "elo"
    render();
  });
});

loadEvents();