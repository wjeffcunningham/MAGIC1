/* =========================================================
   League Tracker – Core Logic (Robust + Elimination + Elo)
   - Tabs: "bcpmm" | "league" | "elo"
   - Elo computed globally (all matches), zero-sum
   - Includes Swiss + ALL elimination matches
   - 16-per-page pagination
   - Win-streak 🔥 and champion 🏆 markers
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

const START_ELO = 1600;
const WIN_STREAK_THRESHOLD = 3;
const BCPMM_CHAMPION = "caitlyn-bethune";

const PAGE_SIZE = 16;
let currentPage = 0;

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

  render();
}

/* =========================================================
   Helpers
========================================================= */

function slugToName(slug) {
  return (slug || "").replace(/-/g, " ");
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
   Elo + Win Streaks (computed once)
========================================================= */

function computeEloAndStreaks() {
  const ratings = {};
  const recent = {};

  function ensure(p) {
    if (!(p in ratings)) ratings[p] = START_ELO;
    if (!(p in recent)) recent[p] = [];
  }

  function push(player, win) {
    recent[player].push(win);
    if (recent[player].length > WIN_STREAK_THRESHOLD) recent[player].shift();
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

      push(m.playerA, Sa === 1);
      push(m.playerB, Sa === 0);
    }
  }

  const streakMap = {};
  Object.keys(recent).forEach(p => {
    streakMap[p] =
      recent[p].length === WIN_STREAK_THRESHOLD &&
      recent[p].every(Boolean);
  });

  const eloRows = Object.entries(ratings)
    .map(([player, value]) => ({
      player,
      value: Math.round(value),
      streak: streakMap[player]
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
    if (!event.standings) continue;

    for (const row of event.standings) {
      totals[row.player] =
        (totals[row.player] || 0) + row.match_points * mult;
    }
  }

  return Object.entries(totals)
    .map(([player, value]) => ({
      player,
      value,
      streak: streakMap[player]
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
   Render + Pagination
========================================================= */

function render() {
  ladderBody.innerHTML = "";

  const { eloRows, streakMap } = computeEloAndStreaks();

  let rows = [];
  if (currentMode === "bcpmm") rows = computePointsRace(streakMap);
  if (currentMode === "league") rows = computeLatestLeagueStandings();
  if (currentMode === "elo") rows = eloRows;

  const start = currentPage * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageRows = rows.slice(start, end);

  pageRows.forEach((r, i) => {
    const showFire =
      (currentMode === "bcpmm" || currentMode === "elo") && r.streak;

    const fire = showFire ? " 🔥" : "";
    const trophy =
      currentMode === "bcpmm" && r.player === BCPMM_CHAMPION ? " 🏆" : "";

    ladderBody.insertAdjacentHTML(
      "beforeend",
      `
      <tr>
        <td class="rank">${start + i + 1}</td>
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

  renderPager(rows.length);
}

function renderPager(total) {
  let pager = document.getElementById("pager");
  if (!pager) {
    pager = document.createElement("div");
    pager.id = "pager";
    pager.style.marginTop = "1.25rem";
    pager.style.display = "flex";
    pager.style.justifyContent = "space-between";
    ladderBody.parentElement.after(pager);
  }

  pager.innerHTML = "";
  const maxPage = Math.floor((total - 1) / PAGE_SIZE);

  if (currentPage > 0) {
    const prev = document.createElement("button");
    prev.textContent = "«";
    prev.onclick = () => {
      currentPage--;
      render();
    };
    pager.appendChild(prev);
  } else {
    pager.appendChild(document.createElement("span"));
  }

  if (currentPage < maxPage) {
    const next = document.createElement("button");
    next.textContent = "»";
    next.onclick = () => {
      currentPage++;
      render();
    };
    pager.appendChild(next);
  }
}

/* =========================================================
   Tabs
========================================================= */

tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
    currentPage = 0;
    render();
  });
});

loadEvents();