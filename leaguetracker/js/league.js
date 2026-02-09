/* =========================================================
   League Tracker – Core Logic (Robust + Elimination + Elo)
   - Tabs: "bcpmm" | "league" | "elo"
   - Elo computed globally (all matches), zero-sum
   - Includes Swiss + ALL elimination matches (robust walker)
   - FIX: BCWL points use latest snapshot only (prevents double-count)
   - Streaks: 🔥 = 2 consecutive wins, 🔥🔥 = 3+ consecutive wins
   - Champion 🏆 (BCPMM winner) shown on BCPMM + Elo
   - Pagination: 16 rows per page with << / >> controls (injected)
========================================================= */

const EVENT_PATHS = [
  "/leaguetracker/data/raw/events/bcpmm-2026-01-10.json",
  "/leaguetracker/data/raw/events/connections-2026-01-12.json",
  "/leaguetracker/data/raw/events/connections-2026-01-26.json",
  "/leaguetracker/data/raw/events/stronghold-2026-02-01.json",
  "/leaguetracker/data/raw/events/bcwl-2026-01-26-r1.json",
  "/leaguetracker/data/raw/events/bcwl-2026-02-02-r2.json"
];

const PAGE_SIZE = 16;
const START_ELO = 1600;

// Champion (this season)
const BCPMM_CHAMPION = "caitlyn-bethune";

const ladderBody = document.getElementById("ladder-body");
const tabs = document.querySelectorAll(".tabs button");

let events = [];
let currentMode = "bcpmm";
let pageByMode = { bcpmm: 0, league: 0, elo: 0 };

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
  return ({ BCPMM: 6, SHG: 3, Connections: 2, BCWL: 1 }[series] ?? 1);
}

function getKValue(series) {
  return ({ BCPMM: 64, SHG: 32, Connections: 24, BCWL: 16 }[series] ?? 16);
}

function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

/* =========================================================
   Normalize match-like objects + scoring
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
   Collect ALL matches (Swiss + Robust Elimination)
========================================================= */

function collectMatches(event) {
  const out = [];

  // Swiss
  for (const round of event.rounds || []) {
    for (const raw of round.matches || []) {
      const m = normalizeMatchLike(raw);
      if (m) out.push(m);
    }
  }

  // Elimination (walk any nested structure)
  (function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "object") {
      const m = normalizeMatchLike(node);
      if (m) return out.push(m);
      Object.values(node).forEach(walk);
    }
  })(event.elimination);

  return out;
}

/* =========================================================
   Compute streaks (TRUE consecutive wins from most recent match)
   streakLen = number of consecutive wins from the end
   fireCount: 0 (none), 1 (🔥 for 2 wins), 2 (🔥🔥 for 3+ wins)
========================================================= */

function computeStreakMap() {
  const resultsByPlayer = {}; // player -> [ {win:boolean} ... ] in chronological order

  function ensure(p) {
    if (!resultsByPlayer[p]) resultsByPlayer[p] = [];
  }

  const orderedEvents = [...events].sort(
    (a, b) => new Date(a.event.date) - new Date(b.event.date)
  );

  for (const event of orderedEvents) {
    for (const m of collectMatches(event)) {
      const Sa = scoreAFromMatch(m);
      if (Sa === null) continue;

      ensure(m.playerA);
      ensure(m.playerB);

      // Draw breaks streak (win=false)
      const aWin = Sa === 1;
      const bWin = Sa === 0;

      resultsByPlayer[m.playerA].push({ win: aWin });
      resultsByPlayer[m.playerB].push({ win: bWin });
    }
  }

  const fireCountByPlayer = {};

  for (const [player, arr] of Object.entries(resultsByPlayer)) {
    // Count consecutive wins starting from most recent
    let streakLen = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].win) streakLen++;
      else break;
    }

    // Convert streak length to fire count
    const fireCount = streakLen >= 3 ? 2 : streakLen === 2 ? 1 : 0;
    fireCountByPlayer[player] = fireCount;
  }

  return fireCountByPlayer;
}

/* =========================================================
   Elo (global replay, zero-sum, includes elimination)
========================================================= */

function computeEloRows(fireCountByPlayer) {
  const ratings = {};

  function ensure(p) {
    if (!(p in ratings)) ratings[p] = START_ELO;
  }

  const orderedEvents = [...events].sort(
    (a, b) => new Date(a.event.date) - new Date(b.event.date)
  );

  for (const event of orderedEvents) {
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
    }
  }

  return Object.entries(ratings)
    .map(([player, value]) => ({
      player,
      value: Math.round(value),
      fire: fireCountByPlayer[player] || 0
    }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   Points Race (weighted across all series)
   FIX: BCWL standings are cumulative snapshots, so use only
        the latest BCWL event standings (most recent date).
========================================================= */

function computePointsRace(fireCountByPlayer) {
  const totals = {};

  // Find latest BCWL snapshot (if any)
  const latestBCWL = [...events]
    .filter(e => e?.event?.series === "BCWL" && Array.isArray(e.standings))
    .sort((a, b) => new Date(b.event.date) - new Date(a.event.date))[0];

  for (const event of events) {
    const series = event?.event?.series;
    const mult = getPointMultiplier(series);

    if (!Array.isArray(event.standings)) continue;

    // IMPORTANT: Prevent BCWL double counting by taking only latest snapshot
    if (series === "BCWL" && event !== latestBCWL) continue;

    for (const row of event.standings) {
      const p = row.player;
      const pts = row.match_points * mult;
      totals[p] = (totals[p] || 0) + pts;
    }
  }

  return Object.entries(totals)
    .map(([player, value]) => ({
      player,
      value,
      fire: fireCountByPlayer[player] || 0
    }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   League (latest BCWL standings)
========================================================= */

function computeLatestLeagueStandings() {
  const league = [...events]
    .filter(e => e?.event?.series === "BCWL")
    .sort((a, b) => new Date(b.event.date) - new Date(a.event.date))[0];

  if (!league || !Array.isArray(league.standings)) return [];

  return league.standings
    .map(r => ({ player: r.player, value: r.match_points }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   Pagination UI (injected; no league.html changes needed)
========================================================= */

function ensurePager() {
  let pager = document.getElementById("ladder-pager");
  if (pager) return pager;

  const table = ladderBody.closest("table");
  pager = document.createElement("div");
  pager.id = "ladder-pager";
  pager.style.display = "flex";
  pager.style.gap = "10px";
  pager.style.alignItems = "center";
  pager.style.justifyContent = "flex-end";
  pager.style.marginTop = "14px";
  pager.style.color = "var(--muted)";
  pager.style.userSelect = "none";

  pager.innerHTML = `
    <button id="pager-prev" type="button" style="
      border:1px solid var(--muted); background:transparent; color:var(--fg);
      padding:6px 10px; font: inherit; font-weight:700; cursor:pointer;
    ">&lt;&lt;</button>
    <span id="pager-label" style="font-weight:700;"></span>
    <button id="pager-next" type="button" style="
      border:1px solid var(--muted); background:transparent; color:var(--fg);
      padding:6px 10px; font: inherit; font-weight:700; cursor:pointer;
    ">&gt;&gt;</button>
  `;

  table.insertAdjacentElement("afterend", pager);

  document.getElementById("pager-prev").addEventListener("click", () => {
    const p = pageByMode[currentMode] || 0;
    if (p > 0) {
      pageByMode[currentMode] = p - 1;
      render();
    }
  });

  document.getElementById("pager-next").addEventListener("click", () => {
    pageByMode[currentMode] = (pageByMode[currentMode] || 0) + 1;
    render();
  });

  return pager;
}

function updatePager(totalRows) {
  const pager = ensurePager();
  const prev = document.getElementById("pager-prev");
  const next = document.getElementById("pager-next");
  const label = document.getElementById("pager-label");

  const page = pageByMode[currentMode] || 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  // clamp page
  if (page >= totalPages) pageByMode[currentMode] = totalPages - 1;

  const page2 = pageByMode[currentMode] || 0;
  const start = page2 * PAGE_SIZE + 1;
  const end = Math.min(totalRows, (page2 + 1) * PAGE_SIZE);

  label.textContent = totalRows
    ? `${start}-${end} of ${totalRows}`
    : `0-0 of 0`;

  prev.disabled = page2 <= 0;
  next.disabled = page2 >= totalPages - 1;

  prev.style.opacity = prev.disabled ? "0.35" : "1";
  next.style.opacity = next.disabled ? "0.35" : "1";
  prev.style.cursor = prev.disabled ? "default" : "pointer";
  next.style.cursor = next.disabled ? "default" : "pointer";

  // hide pager if one page
  pager.style.display = totalRows > PAGE_SIZE ? "flex" : "none";
}

/* =========================================================
   Render
========================================================= */

function render() {
  ladderBody.innerHTML = "";

  const fireCountByPlayer = computeStreakMap();

  const eloRows = computeEloRows(fireCountByPlayer);
  const pointsRows = computePointsRace(fireCountByPlayer);
  const leagueRows = computeLatestLeagueStandings();

  let rows = [];
  if (currentMode === "bcpmm") rows = pointsRows;
  if (currentMode === "league") rows = leagueRows;
  if (currentMode === "elo") rows = eloRows;

  // paginate
  const page = pageByMode[currentMode] || 0;
  const startIdx = page * PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + PAGE_SIZE);

  updatePager(rows.length);

  if (!pageRows.length) {
    ladderBody.innerHTML = `<tr><td colspan="3" class="empty">No data available</td></tr>`;
    return;
  }

  pageRows.forEach((r, i) => {
    const showFire = (currentMode === "bcpmm" || currentMode === "elo") && r.fire > 0;
    const fires = showFire ? ` ${"🔥".repeat(r.fire)}` : "";

    const trophy = (currentMode === "bcpmm" || currentMode === "elo") && r.player === BCPMM_CHAMPION
      ? " 🏆"
      : "";

    ladderBody.insertAdjacentHTML(
      "beforeend",
      `
      <tr>
        <td class="rank">${startIdx + i + 1}</td>
        <td class="player">
          <a href="./player.html?player=${r.player}">${slugToName(r.player)}</a>${fires}${trophy}
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

    // start each tab at page 0
    pageByMode[currentMode] = 0;

    render();
  });
});

loadEvents();