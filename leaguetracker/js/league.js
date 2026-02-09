/* =========================================================
   League Tracker – Core Logic
   - Pagination (16 per page)
   - Hot streak 🔥 (won last 3 matches)
   - Trophy 🏆 (season winners)
   - Elo computed globally (Swiss + elimination)
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

/* TEMP: season trophy winners */
const TROPHY_WINNERS = new Set([
  "caitlyn-bethune" // BCPMM winner
]);

const ladderBody = document.getElementById("ladder-body");
const tabs = document.querySelectorAll(".tabs button");

let events = [];
let currentMode = "bcpmm";
let currentPage = 0;

/* =========================================================
   Load events
========================================================= */

async function loadEvents() {
  events = [];

  for (const path of EVENT_PATHS) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error();
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

function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

function getKValue(series) {
  return { BCPMM: 64, SHG: 32, Connections: 24, BCWL: 16 }[series] ?? 16;
}

function matchPoints(gA, gB, result) {
  if (result === "D") return [1, 1];
  if (typeof gA === "number" && typeof gB === "number" && gA === gB) return [1, 1];
  return gA > gB ? [3, 0] : [0, 3];
}

/* =========================================================
   Normalize + collect ALL matches
========================================================= */

function normalizeMatchLike(m) {
  const a = m.playerA ?? m.player1;
  const b = m.playerB ?? m.player2;
  if (!a || !b) return null;

  return {
    playerA: a,
    playerB: b,
    gamesA: m.gamesA,
    gamesB: m.gamesB,
    result: m.result,
    winner: m.winner
  };
}

function scoreA(m) {
  if (m.result === "D") return 0.5;
  if (typeof m.gamesA === "number" && typeof m.gamesB === "number") {
    if (m.gamesA === m.gamesB) return 0.5;
    return m.gamesA > m.gamesB ? 1 : 0;
  }
  if (m.winner) return m.winner === m.playerA ? 1 : 0;
  return null;
}

function collectMatches(event) {
  const out = [];

  for (const r of event.rounds || []) {
    for (const raw of r.matches || []) {
      const m = normalizeMatchLike(raw);
      if (m) out.push(m);
    }
  }

  (function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "object") {
      const m = normalizeMatchLike(node);
      if (m) out.push(m);
      Object.values(node).forEach(walk);
    }
  })(event.elimination);

  return out;
}

/* =========================================================
   Build per-player match history (for streaks)
========================================================= */

function buildMatchHistory() {
  const history = {};

  const ordered = [...events].sort(
    (a, b) => new Date(a.event.date) - new Date(b.event.date)
  );

  for (const event of ordered) {
    for (const m of collectMatches(event)) {
      const Sa = scoreA(m);
      if (Sa === null) continue;

      const Sb = 1 - Sa;

      history[m.playerA] ??= [];
      history[m.playerB] ??= [];

      history[m.playerA].push(Sa);
      history[m.playerB].push(Sb);
    }
  }

  return history;
}

/* =========================================================
   Compute Elo
========================================================= */

function computeElo(matchHistory) {
  const ratings = {};

  function ensure(p) {
    if (!(p in ratings)) ratings[p] = START_ELO;
  }

  const ordered = [...events].sort(
    (a, b) => new Date(a.event.date) - new Date(b.event.date)
  );

  for (const event of ordered) {
    const K = getKValue(event?.event?.series);
    for (const m of collectMatches(event)) {
      const Sa = scoreA(m);
      if (Sa === null) continue;

      ensure(m.playerA);
      ensure(m.playerB);

      const Ra = ratings[m.playerA];
      const Rb = ratings[m.playerB];
      const Ea = expectedScore(Ra, Rb);

      const delta = K * (Sa - Ea);
      ratings[m.playerA] += delta;
      ratings[m.playerB] -= delta;
    }
  }

  return Object.entries(ratings)
    .map(([player, value]) => ({ player, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   Points Race
========================================================= */

function computePointsRace() {
  const totals = {};

  for (const e of events) {
    const mult = { BCPMM: 6, SHG: 3, Connections: 2, BCWL: 1 }[e?.event?.series] ?? 1;

    if (e.standings) {
      for (const r of e.standings) {
        totals[r.player] = (totals[r.player] || 0) + r.match_points * mult;
      }
    }
  }

  return Object.entries(totals)
    .map(([player, value]) => ({ player, value }))
    .sort((a, b) => b.value - a.value);
}

/* =========================================================
   Render (with pagination + emojis)
========================================================= */

function render() {
  ladderBody.innerHTML = "";

  const matchHistory = buildMatchHistory();
  let rows = [];

  if (currentMode === "bcpmm") rows = computePointsRace();
  if (currentMode === "elo") rows = computeElo(matchHistory);

  const start = currentPage * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);

  slice.forEach((r, i) => {
    const history = matchHistory[r.player] || [];
    const hot = history.slice(-3).every(x => x === 1);
    const fire = hot ? " 🔥" : "";
    const trophy = TROPHY_WINNERS.has(r.player) ? " 🏆" : "";

    ladderBody.insertAdjacentHTML(
      "beforeend",
      `<tr>
        <td class="rank">${start + i + 1}</td>
        <td class="player">
          <a href="./player.html?player=${r.player}">
            ${slugToName(r.player)}${fire}${trophy}
          </a>
        </td>
        <td class="num">${r.value}</td>
      </tr>`
    );
  });

  renderPager(rows.length);
}

function renderPager(total) {
  const old = document.getElementById("pager");
  if (old) old.remove();

  if (total <= PAGE_SIZE) return;

  const pager = document.createElement("div");
  pager.id = "pager";
  pager.style.marginTop = "1.5rem";
  pager.style.display = "flex";
  pager.style.justifyContent = "space-between";

  pager.innerHTML = `
    <button ${currentPage === 0 ? "disabled" : ""}>«</button>
    <button ${(currentPage + 1) * PAGE_SIZE >= total ? "disabled" : ""}>»</button>
  `;

  const [prev, next] = pager.querySelectorAll("button");

  prev.onclick = () => { currentPage--; render(); };
  next.onclick = () => { currentPage++; render(); };

  ladderBody.parentElement.after(pager);
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