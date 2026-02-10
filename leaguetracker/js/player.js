/* =========================================================
   Player Page – Elo + Points + Match History (CANONICAL)
   - Canonical player IDs (aliases folded at ingestion time)
   - Elo replayed globally (true opponent ratings, chronological)
   - Points breakdown uses standings when present; else derives from matches/byes
========================================================= */

/* =========================
   Aliases
========================= */

const PLAYER_ALIASES = {
  "ghost-empire": "markus-thibeau",
  "spencer-sj": "spencer-shaw-jaworek"
};

function canonicalPlayer(slug) {
  const s = (slug || "").trim();
  return PLAYER_ALIASES[s] || s;
}

function slugToName(slug) {
  return (slug || "").replace(/-/g, " ");
}

/* =========================
   Event sources (MUST match league.js)
========================= */

const EVENT_PATHS = [
  "/leaguetracker/data/raw/events/bcpmm-2026-01-10.json",
  "/leaguetracker/data/raw/events/connections-2026-01-12.json",
  "/leaguetracker/data/raw/events/connections-2026-01-26.json",
  "/leaguetracker/data/raw/events/connections-2026-02-09.json",
  "/leaguetracker/data/raw/events/stronghold-2026-02-01.json",
  "/leaguetracker/data/raw/events/bcwl-2026-01-26-r1.json",
  "/leaguetracker/data/raw/events/bcwl-2026-02-02-r2.json"
];

/* =========================
   Constants
========================= */

const START_ELO = 1600;

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

/* =========================
   IMPORTANT: Canonicalize entire event at ingestion time
   This is what actually "folds" aliases into the real player.
========================= */

function canonicalizeEvent(event) {
  if (!event || typeof event !== "object") return event;

  // standings
  if (Array.isArray(event.standings)) {
    event.standings.forEach(row => {
      if (row && row.player) row.player = canonicalPlayer(row.player);
    });
  }

  // rounds + matches + byes
  for (const round of event.rounds || []) {
    for (const m of round.matches || []) {
      if (m?.playerA) m.playerA = canonicalPlayer(m.playerA);
      if (m?.playerB) m.playerB = canonicalPlayer(m.playerB);
      if (m?.winner)  m.winner  = canonicalPlayer(m.winner);
    }

    if (Array.isArray(round.byes)) {
      round.byes = round.byes.map(canonicalPlayer);
    }
  }

  // elim walker (if present)
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "object") {
      // if it looks like a match, canonicalize fields
      if (node.playerA) node.playerA = canonicalPlayer(node.playerA);
      if (node.playerB) node.playerB = canonicalPlayer(node.playerB);
      if (node.winner)  node.winner  = canonicalPlayer(node.winner);

      Object.values(node).forEach(walk);
    }
  }

  walk(event.elimination);

  // derived.event_points (older Connections files)
  if (event.derived?.event_points && typeof event.derived.event_points === "object") {
    const next = {};
    for (const [p, v] of Object.entries(event.derived.event_points)) {
      next[canonicalPlayer(p)] = (next[canonicalPlayer(p)] || 0) + Number(v || 0);
    }
    event.derived.event_points = next;
  }

  return event;
}

/* =========================
   Match normalization
========================= */

function normalizeMatch(raw) {
  if (!raw || typeof raw !== "object") return null;

  const a = raw.playerA ?? raw.player1 ?? raw.p1 ?? raw.a ?? null;
  const b = raw.playerB ?? raw.player2 ?? raw.p2 ?? raw.b ?? null;
  if (!a || !b) return null;

  // events are canonicalized already, but keep this safe:
  const playerA = canonicalPlayer(a);
  const playerB = canonicalPlayer(b);

  const gamesA = raw.gamesA ?? raw.games1 ?? raw.g1 ?? raw.scoreA ?? null;
  const gamesB = raw.gamesB ?? raw.games2 ?? raw.g2 ?? raw.scoreB ?? null;

  const winner = raw.winner ? canonicalPlayer(raw.winner) : null;

  return { playerA, playerB, gamesA, gamesB, winner, result: raw.result ?? null };
}

function scoreAFromMatch(m) {
  if (!m) return null;
  if (m.result === "D") return 0.5;

  if (typeof m.gamesA === "number" && typeof m.gamesB === "number") {
    if (m.gamesA === m.gamesB) return 0.5;
    return m.gamesA > m.gamesB ? 1 : 0;
  }

  if (m.winner) return m.winner === m.playerA ? 1 : 0;

  return null;
}

function matchPointsForPlayers(m) {
  const Sa = scoreAFromMatch(m);
  if (Sa === null) return null;

  if (Sa === 0.5) return { a: 1, b: 1 };
  if (Sa === 1) return { a: 3, b: 0 };
  return { a: 0, b: 3 };
}

/* =========================
   Collect matches (Swiss + Elim walker)
========================= */

function collectMatches(event) {
  const out = [];

  for (const round of event.rounds || []) {
    for (const raw of round.matches || []) {
      const m = normalizeMatch(raw);
      if (m) out.push(m);
    }
  }

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "object") {
      const m = normalizeMatch(node);
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

/* =========================
   Load events (NOW canonicalized)
========================= */

async function loadEvents() {
  const events = [];

  for (const path of EVENT_PATHS) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const ev = canonicalizeEvent(await res.json());
      events.push(ev);
    } catch {
      console.warn("[Player] Skipped:", path);
    }
  }

  events.sort((a, b) => new Date(a?.event?.date) - new Date(b?.event?.date));
  return events;
}

/* =========================
   Elo replay (GLOBAL)
========================= */

function replayGlobalEloForPlayer(events, playerSlugRaw) {
  const player = canonicalPlayer(playerSlugRaw);

  const ratings = {};
  function ensure(p) {
    if (!(p in ratings)) ratings[p] = START_ELO;
  }

  const history = [];

  for (const event of events) {
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

      if (m.playerA === player || m.playerB === player) {
        const isA = m.playerA === player;
        const opponent = isA ? m.playerB : m.playerA;

        const gf = isA ? m.gamesA : m.gamesB;
        const ga = isA ? m.gamesB : m.gamesA;

        const scoreText =
          typeof gf === "number" && typeof ga === "number"
            ? `${gf}-${ga}`
            : (Sa === 0.5 ? "D" : ((isA && Sa === 1) || (!isA && Sa === 0) ? "W" : "L"));

        const playerDelta = isA ? deltaA : -deltaA;

        history.push({
          date: event?.event?.date ?? "",
          seriesNorm: normalizeSeries(event?.event?.series),
          opponent,
          scoreText,
          eloDelta: Math.round(playerDelta),
          eloAfter: Math.round(ratings[player])
        });
      }
    }
  }

  history.sort((a, b) => new Date(b.date) - new Date(a.date));
  return history;
}

/* =========================
   Points breakdown (per player)
========================= */

function computePointsBreakdown(events, playerSlugRaw) {
  const player = canonicalPlayer(playerSlugRaw);

  const buckets = { BCPMM: 0, SHG: 0, CONNECTIONS: 0, BCWL: 0 };

  for (const event of events) {
    const seriesNorm = normalizeSeries(event?.event?.series);
    if (!seriesNorm) continue;

    const mult = getPointMultiplier(event?.event?.series);

    // standings (authoritative)
    if (Array.isArray(event.standings) && event.standings.length) {
      const row = event.standings.find(r => r?.player === player);
      if (row) buckets[seriesNorm] += Number(row.match_points || 0) * mult;
      continue;
    }

    // older derived.event_points (connections-2026-01-12 style)
    if (event.derived?.event_points && typeof event.derived.event_points === "object") {
      const mp = Number(event.derived.event_points[player] || 0);
      buckets[seriesNorm] += mp * mult;
      continue;
    }

    // derive from matches + byes
    let mp = 0;

    for (const round of event.rounds || []) {
      for (const raw of round.matches || []) {
        const m = normalizeMatch(raw);
        if (!m) continue;

        const pts = matchPointsForPlayers(m);
        if (!pts) continue;

        if (m.playerA === player) mp += pts.a;
        if (m.playerB === player) mp += pts.b;
      }

      for (const bye of round.byes || []) {
        if (bye === player) mp += 3;
      }
    }

    buckets[seriesNorm] += mp * mult;
  }

  return buckets;
}

/* =========================
   Render
========================= */

async function main() {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("player") || "").trim();

  const player = canonicalPlayer(raw);

  // If alias URL, rewrite URL in-place
  if (raw && raw !== player) {
    params.set("player", player);
    history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }

  // Header
  const nameEl = document.getElementById("player-name") || document.querySelector("h1");
  const ratingEl = document.getElementById("player-rating");
  if (nameEl) nameEl.textContent = player;
  if (ratingEl) ratingEl.textContent = `Player slug: ${player}`;

  const events = await loadEvents();

  // Points Breakdown table in your HTML (the FIRST table under "Points Breakdown")
  const pointsTables = Array.from(document.querySelectorAll("table"));
  const pointsTable = pointsTables[0];
  const pointsBody = pointsTable?.querySelector("tbody") || pointsTable;

  const points = computePointsBreakdown(events, player);

  if (pointsBody) {
    // Your existing markup uses 4 rows already; we just replace the right column
    const rows = pointsTable.querySelectorAll("tbody tr").length
      ? pointsTable.querySelectorAll("tbody tr")
      : pointsTable.querySelectorAll("tr");

    // If your HTML already has the rows, patch them in order:
    // BCPMM, SHG, Connections, BCWL
    const vals = [points.BCPMM, points.SHG, points.CONNECTIONS, points.BCWL];
    rows.forEach((tr, i) => {
      const tds = tr.querySelectorAll("td");
      if (tds.length >= 2 && i < vals.length) tds[1].textContent = vals[i];
    });
  }

  // Match History table is the SECOND table in your HTML
  const matchesTable = pointsTables[1] || document.getElementById("matches-table");
  const matchBody = matchesTable?.querySelector("tbody");

  const historyRows = replayGlobalEloForPlayer(events, player);

  if (!matchBody) return;

  if (!historyRows.length) {
    matchBody.innerHTML = `<tr><td colspan="6" class="center">No matches recorded.</td></tr>`;
    return;
  }

  matchBody.innerHTML = historyRows
    .map(h => {
      const d = h.eloDelta;
      const dStr = d > 0 ? `+${d}` : `${d}`;
      const opp = encodeURIComponent(h.opponent);

      return `
        <tr>
          <td>${h.date}</td>
          <td>${h.seriesNorm === "CONNECTIONS" ? "Connections" : (h.seriesNorm || "Event")}</td>
          <td><a href="./player.html?player=${opp}">${h.opponent}</a></td>
          <td>${h.scoreText}</td>
          <td class="center" style="color:${d >= 0 ? "green" : "red"}">${dStr}</td>
          <td class="center">${h.eloAfter}</td>
        </tr>
      `;
    })
    .join("");
}

document.addEventListener("DOMContentLoaded", main);