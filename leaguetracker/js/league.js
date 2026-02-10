/* =========================================================
   League Tracker – Core Logic (Robust + Elimination + Elo)
   - Tabs: "bcpmm" | "league" | "elo"
   - Elo computed globally (all matches), zero-sum
   - Points race: uses standings when present, otherwise derives from matches + byes
   - Includes Swiss + ALL elimination matches (robust walker)
   - Win-streak markers:
       🔥  = last 2 matches were wins
       🔥🔥 = last 3+ matches were wins
   - Champion marker:
       🏆 on BCPMM tab only (current season BCPMM winner)
   - Pagination: 16 per page with « and »
   - Player aliasing (FOLDED AT INGESTION TIME):
       ghost-empire -> markus-thibeau
       spencer-sj   -> spencer-shaw-jaworek
========================================================= */

const PLAYER_ALIASES = {
  "ghost-empire": "markus-thibeau",
  "spencer-sj": "spencer-shaw-jaworek"
};

function canonicalPlayer(slug) {
  const s = (slug || "").trim();
  return PLAYER_ALIASES[s] || s;
}

const EVENT_PATHS = [
  "/leaguetracker/data/raw/events/bcpmm-2026-01-10.json",
  "/leaguetracker/data/raw/events/connections-2026-01-12.json",
  "/leaguetracker/data/raw/events/connections-2026-01-26.json",
  "/leaguetracker/data/raw/events/connections-2026-02-09.json",
  "/leaguetracker/data/raw/events/stronghold-2026-02-01.json",
  "/leaguetracker/data/raw/events/bcwl-2026-01-26-r1.json",
  "/leaguetracker/data/raw/events/bcwl-2026-02-02-r2.json"
];

const ladderBody = document.getElementById("ladder-body");
const tabs = document.querySelectorAll(".tabs button");

let events = [];
let currentMode = "bcpmm";

/* =========================================================
   Pagination
========================================================= */

const PAGE_SIZE = 16;
let pageIndexByMode = { bcpmm: 0, league: 0, elo: 0 };

/* =========================================================
   Constants (Badges / Elo)
========================================================= */

const START_ELO = 1600;
const BCPMM_CHAMPION = "caitlyn-bethune";

/* =========================================================
   Series helpers (robust)
========================================================= */

function normalizeSeries(series) {
  if (!series) return null;
  const s = String(series).toLowerCase();
  if (s.includes("bcpmm")) return "BCPMM";
  if (s.includes("stronghold") || s === "shg") return "SHG";
  if (s.includes("connection")) return "CONNECTIONS";
  if (s.includes("league") || s.includes("bcwl")) return "BCWL";
  return null;
}

function getPointMultiplier(seriesRaw) {
  const norm = normalizeSeries(seriesRaw);
  return (
    {
      BCPMM: 6,
      SHG: 3,
      CONNECTIONS: 2,
      BCWL: 1
    }[norm] ?? 1
  );
}

function getKValue(seriesRaw) {
  const norm = normalizeSeries(seriesRaw);
  return (
    {
      BCPMM: 64,
      SHG: 32,
      CONNECTIONS: 24,
      BCWL: 16
    }[norm] ?? 16
  );
}

function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

/* =========================================================
   IMPORTANT: Canonicalize entire event at ingestion time
========================================================= */

function canonicalizeEvent(event) {
  if (!event || typeof event !== "object") return event;

  if (Array.isArray(event.standings)) {
    event.standings.forEach(row => {
      if (row?.player) row.player = canonicalPlayer(row.player);
    });
  }

  for (const round of event.rounds || []) {
    for (const m of round.matches || []) {
      if (m?.playerA) m.playerA = canonicalPlayer(m.playerA);
      if (m?.playerB) m.playerB = canonicalPlayer(m.playerB);
      if (m?.winner)  m.winner  = canonicalPlayer(m.winner);
    }
    if (Array.isArray(round.byes)) round.byes = round.byes.map(canonicalPlayer);
  }

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "object") {
      if (node.playerA) node.playerA = canonicalPlayer(node.playerA);
      if (node.playerB) node.playerB = canonicalPlayer(node.playerB);
      if (node.winner)  node.winner  = canonicalPlayer(node.winner);
      Object.values(node).forEach(walk);
    }
  }
  walk(event.elimination);

  if (event.derived?.event_points && typeof event.derived.event_points === "object") {
    const next = {};
    for (const [p, v] of Object.entries(event.derived.event_points)) {
      next[canonicalPlayer(p)] = (next[canonicalPlayer(p)] || 0) + Number(v || 0);
    }
    event.derived.event_points = next;
  }

  return event;
}

/* =========================================================
   Load events (NOW canonicalized)
========================================================= */

async function loadEvents() {
  events = [];

  for (const path of EVENT_PATHS) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const ev = canonicalizeEvent(await res.json());
      events.push(ev);
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

/* =========================================================
   Normalize match-like objects
========================================================= */

function normalizeMatchLike(node) {
  if (!node || typeof node !== "object") return null;

  const a = node.playerA ?? node.player1 ?? node.p1 ?? node.a ?? null;
  const b = node.playerB ?? node.player2 ?? node.p2 ?? node.b ?? null;
  if (!a || !b) return null;

  // events already canonicalized, but keep safe:
  const playerA = canonicalPlayer(a);
  const playerB = canonicalPlayer(b);

  return {
    playerA,
    playerB,
    gamesA: node.gamesA ?? node.games1 ?? node.g1 ?? node.scoreA ?? null,
    gamesB: node.gamesB ?? node.games2 ?? node.g2 ?? node.scoreB ?? null,
    winner: node.winner ? canonicalPlayer(node.winner) : null,
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
   Collect matches (Swiss + Elimination) – robust walker
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
   Points from match (when standings missing)
========================================================= */

function matchPointsForPlayers(m) {
  const Sa = scoreAFromMatch(m);
  if (Sa === null) return null;

  if (Sa === 0.5) return { a: 1, b: 1 };
  if (Sa === 1) return { a: 3, b: 0 };
  return { a: 0, b: 3 };
}

/* =========================================================
   Elo + Streaks
========================================================= */

function computeEloAndStreaks() {
  const ratings = {};
  const streakLen = {};

  function ensure(p) {
    if (!(p in ratings)) ratings[p] = START_ELO;
    if (!(p in streakLen)) streakLen[p] = 0;
  }

  const ordered = [...events].sort(
    (a, b) => new Date(a?.event?.date) - new Date(b?.event?.date)
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

      if (Sa === 1) {
        streakLen[m.playerA] += 1;
        streakLen[m.playerB] = 0;
      } else if (Sa === 0) {
        streakLen[m.playerB] += 1;
        streakLen[m.playerA] = 0;
      } else {
        streakLen[m.playerA] = 0;
        streakLen[m.playerB] = 0;
      }
    }
  }

  const eloRows = Object.entries(ratings)
    .map(([player, value]) => ({
      player,
      value: Math.round(value),
      streakLen: streakLen[player] || 0
    }))
    .sort((a, b) => b.value - a.value);

  return { eloRows, streakLen };
}

function firesForStreak(n) {
  if (n >= 3) return " 🔥🔥";
  if (n >= 2) return " 🔥";
  return "";
}

/* =========================================================
   Points Race (ALL events)
========================================================= */

function computePointsRace(streakLen) {
  const totals = {};

  for (const event of events) {
    const seriesNorm = normalizeSeries(event?.event?.series);
    if (!seriesNorm) continue;

    const mult = getPointMultiplier(event?.event?.series);

    // standings
    if (Array.isArray(event.standings) && event.standings.length) {
      for (const row of event.standings) {
        const p = row.player; // already canonicalized
        totals[p] = (totals[p] || 0) + Number(row.match_points || 0) * mult;
      }
      continue;
    }

    // derived.event_points (older Connections)
    if (event.derived?.event_points && typeof event.derived.event_points === "object") {
      for (const [p, mp] of Object.entries(event.derived.event_points)) {
        totals[p] = (totals[p] || 0) + Number(mp || 0) * mult;
      }
      continue;
    }

    // derive from matches + byes
    for (const round of event.rounds || []) {
      for (const raw of round.matches || []) {
        const m = normalizeMatchLike(raw);
        if (!m) continue;

        const pts = matchPointsForPlayers(m);
        if (!pts) continue;

        totals[m.playerA] = (totals[m.playerA] || 0) + pts.a * mult;
        totals[m.playerB] = (totals[m.playerB] || 0) + pts.b * mult;
      }

      for (const bye of round.byes || []) {
        totals[bye] = (totals[bye] || 0) + 3 * mult;
      }
    }
  }

  return Object.entries(totals)
    .map(([player, value]) => ({
      player,
      value,
      streakLen: streakLen[player] || 0
    }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   League standings (latest BCWL)
========================================================= */

function computeLatestLeagueStandings() {
  const league = [...events]
    .filter(e => normalizeSeries(e?.event?.series) === "BCWL")
    .sort((a, b) => new Date(b.event.date) - new Date(a.event.date))[0];

  if (!league) return [];

  if (Array.isArray(league.standings) && league.standings.length) {
    return league.standings
      .map(r => ({ player: r.player, value: r.match_points || 0 }))
      .sort((a, b) => b.value - a.value);
  }

  const totals = {};
  for (const round of league.rounds || []) {
    for (const raw of round.matches || []) {
      const m = normalizeMatchLike(raw);
      if (!m) continue;

      const pts = matchPointsForPlayers(m);
      if (!pts) continue;

      totals[m.playerA] = (totals[m.playerA] || 0) + pts.a;
      totals[m.playerB] = (totals[m.playerB] || 0) + pts.b;
    }

    for (const bye of round.byes || []) {
      totals[bye] = (totals[bye] || 0) + 3;
    }
  }

  return Object.entries(totals)
    .map(([player, value]) => ({ player, value }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   Pagination UI (injected)
========================================================= */

function ensurePager() {
  let pager = document.getElementById("ladder-pager");
  if (pager) return pager;

  // prefer your ladder table, fallback to first table
  const table =
    document.querySelector("table.ladder") ||
    document.querySelector("table");

  if (!table) return null;

  pager = document.createElement("div");
  pager.id = "ladder-pager";
  pager.style.display = "flex";
  pager.style.justifyContent = "space-between";
  pager.style.alignItems = "center";
  pager.style.marginTop = "1rem";
  pager.style.gap = "1rem";

  pager.innerHTML = `
    <button type="button" id="pager-prev">«</button>
    <div id="pager-label" style="opacity:0.75;"></div>
    <button type="button" id="pager-next">»</button>
  `;

  const btnStyle = (btn) => {
    btn.style.background = "transparent";
    btn.style.border = "1px solid var(--muted)";
    btn.style.color = "var(--fg)";
    btn.style.padding = "0.4rem 0.75rem";
    btn.style.fontFamily = "inherit";
    btn.style.fontWeight = "700";
    btn.style.cursor = "pointer";
  };

  btnStyle(pager.querySelector("#pager-prev"));
  btnStyle(pager.querySelector("#pager-next"));

  table.insertAdjacentElement("afterend", pager);
  return pager;
}

function updatePager(totalRows) {
  const pager = ensurePager();
  if (!pager) return;

  const prevBtn = pager.querySelector("#pager-prev");
  const nextBtn = pager.querySelector("#pager-next");
  const label = pager.querySelector("#pager-label");

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safeIndex = Math.min(Math.max(0, pageIndexByMode[currentMode] || 0), totalPages - 1);
  pageIndexByMode[currentMode] = safeIndex;

  // show only when multiple pages
  pager.style.display = totalPages <= 1 ? "none" : "flex";

  label.textContent = `Page ${safeIndex + 1} / ${totalPages}`;
  prevBtn.disabled = safeIndex === 0;
  nextBtn.disabled = safeIndex >= totalPages - 1;

  prevBtn.onclick = () => {
    pageIndexByMode[currentMode] = Math.max(0, (pageIndexByMode[currentMode] || 0) - 1);
    render();
  };

  nextBtn.onclick = () => {
    pageIndexByMode[currentMode] = Math.min(totalPages - 1, (pageIndexByMode[currentMode] || 0) + 1);
    render();
  };
}

/* =========================================================
   Render
========================================================= */

function render() {
  ladderBody.innerHTML = "";

  const { eloRows, streakLen } = computeEloAndStreaks();

  let rows = [];
  if (currentMode === "bcpmm") rows = computePointsRace(streakLen);
  if (currentMode === "league") rows = computeLatestLeagueStandings();
  if (currentMode === "elo") rows = eloRows;

  updatePager(rows.length);

  const pageIndex = pageIndexByMode[currentMode] || 0;
  const start = pageIndex * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);

  if (!slice.length) {
    ladderBody.innerHTML = `<tr><td colspan="3" class="empty">No data available</td></tr>`;
    return;
  }

  slice.forEach((r, i) => {
    const globalRank = start + i + 1;

    const fire =
      (currentMode === "bcpmm" || currentMode === "elo")
        ? firesForStreak(r.streakLen || 0)
        : "";

    const trophy =
      currentMode === "bcpmm" && r.player === BCPMM_CHAMPION ? " 🏆" : "";

    ladderBody.insertAdjacentHTML(
      "beforeend",
      `
      <tr>
        <td class="rank">${globalRank}</td>
        <td class="player">
          <a href="./player.html?player=${encodeURIComponent(r.player)}">
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
    pageIndexByMode[currentMode] = 0;
    render();
  });
});

loadEvents();