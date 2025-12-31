// /js/league-utils.js
// Shared, deterministic league utilities (no Supabase calls).
// - Elo update
// - CSV parsing (email-keyed)
// - Pool + pairing generation (circle method)
// - TQ computation helpers

/* =========================================================
   ELO
========================================================= */

export function updateElo(rA, rB, winner, K = 16) {
  // winner: "A" | "B" | "D" (draw)
  const EA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const EB = 1 - EA;

  let SA = 0.5;
  let SB = 0.5;
  if (winner === "A") { SA = 1; SB = 0; }
  if (winner === "B") { SA = 0; SB = 1; }

  const newA = Math.round(rA + K * (SA - EA));
  const newB = Math.round(rB + K * (SB - EB));
  return [newA, newB];
}

/* =========================================================
   CSV PARSING
   - Handles quoted fields, commas, CRLF
   - First row = headers
========================================================= */

function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // Escaped quote inside quoted field: ""
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function parseCSV(text) {
  const cleaned = (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (!cleaned) return [];

  const lines = cleaned.split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map(h => normaliseHeader(h));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.every(c => c === "")) continue;

    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cols[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function normaliseHeader(h) {
  return (h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normEmail(e) {
  return (e || "").trim().toLowerCase();
}

/* =========================================================
   ROUND CSV → canonical match rows

   Accepts flexible headers, but REQUIRES emails for:
   - player A
   - player B
   - winner (or result markers)

   Supported winner formats:
   - winner_email column (recommended)
   - result column with values: "A", "B", "D", "draw"
========================================================= */

function pickField(row, candidates) {
  for (const key of candidates) {
    if (row[key] && String(row[key]).trim()) return String(row[key]).trim();
  }
  return "";
}

export function parseRoundCSV(text) {
  const rows = parseCSV(text);

  // Candidate column names (normalised headers)
  const A_EMAIL_KEYS = ["p1_email", "player1_email", "player_a_email", "email_a", "a_email", "player_a", "p1", "player1"];
  const B_EMAIL_KEYS = ["p2_email", "player2_email", "player_b_email", "email_b", "b_email", "player_b", "p2", "player2"];
  const WIN_EMAIL_KEYS = ["winner_email", "winner", "winning_email"];
  const RESULT_KEYS = ["result", "winner_side", "outcome"];

  const out = [];

  rows.forEach((r, idx) => {
    const emailA = normEmail(pickField(r, A_EMAIL_KEYS));
    const emailB = normEmail(pickField(r, B_EMAIL_KEYS));
    if (!emailA || !emailB) return; // ignore blank/incomplete lines

    const winEmailRaw = normEmail(pickField(r, WIN_EMAIL_KEYS));
    const resultRaw = (pickField(r, RESULT_KEYS) || "").trim().toLowerCase();

    let winner = null; // "A" | "B" | "D"
    let winnerEmail = "";

    if (winEmailRaw) {
      winnerEmail = winEmailRaw;
      if (winnerEmail === emailA) winner = "A";
      else if (winnerEmail === emailB) winner = "B";
      else {
        // winner email present but doesn't match either player → skip row
        // (prevents silent corruption)
        throw new Error(`Row ${idx + 2}: winner_email does not match either player email.`);
      }
    } else if (resultRaw) {
      if (resultRaw === "a" || resultRaw === "p1" || resultRaw === "player1") winner = "A";
      else if (resultRaw === "b" || resultRaw === "p2" || resultRaw === "player2") winner = "B";
      else if (resultRaw === "d" || resultRaw === "draw" || resultRaw === "tie") winner = "D";
      else throw new Error(`Row ${idx + 2}: unrecognized result value: "${resultRaw}".`);
    } else {
      throw new Error(`Row ${idx + 2}: missing winner_email (or result).`);
    }

    out.push({
      emailA,
      emailB,
      winner,       // "A" | "B" | "D"
      winnerEmail,  // "" if draw
    });
  });

  if (out.length === 0) {
    throw new Error("No valid matches found in round CSV.");
  }

  return out;
}

/* =========================================================
   POOLS

   Inputs (typical):
   [{ player_id, email, rank, points, tq, rating, ... }, ...]

   Rule:
   - Sorted by rank (ascending). Missing rank go last.
   - Chunk into pools of 8.
   - Returns: [{ poolIndex, members: [...] }]
========================================================= */

export function generatePools(standings, poolSize = 8) {
  const arr = [...(standings || [])];

  arr.sort((a, b) => {
    const ra = Number.isFinite(+a.rank) ? +a.rank : 1e9;
    const rb = Number.isFinite(+b.rank) ? +b.rank : 1e9;
    if (ra !== rb) return ra - rb;
    // fallback: higher points first
    const pa = Number.isFinite(+a.points) ? +a.points : -1;
    const pb = Number.isFinite(+b.points) ? +b.points : -1;
    return pb - pa;
  });

  const pools = [];
  for (let i = 0; i < arr.length; i += poolSize) {
    const chunk = arr.slice(i, i + poolSize);
    pools.push({
      poolIndex: pools.length + 1,
      members: chunk.map((m, j) => ({
        ...m,
        seed: j + 1,
      })),
    });
  }
  return pools;
}

/* =========================================================
   PAIRINGS (Circle method / round-robin subset)
   - Deterministic based on input order (seed order)
   - Supports odd sizes via BYE slot
   - For 8 players, generates perfect non-repeat rounds
========================================================= */

function rotateCircle(list) {
  // list length n (even), fixed first element, rotate rest
  const fixed = list[0];
  const rest = list.slice(1);
  rest.unshift(rest.pop()); // rotate by 1
  return [fixed, ...rest];
}

function roundRobinRounds(ids) {
  // Returns full RR schedule for N (adds BYE if odd)
  const players = [...ids];
  if (players.length < 2) return [];

  const BYE = "__BYE__";
  if (players.length % 2 === 1) players.push(BYE);

  let arr = [...players];
  const n = arr.length;
  const rounds = [];

  // Circle method: n-1 rounds
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== BYE && b !== BYE) pairs.push([a, b]);
    }
    rounds.push(pairs);
    arr = rotateCircle(arr);
  }
  return rounds;
}

export function generatePairingsForPool(poolMembers, roundsWanted = 4) {
  // poolMembers: array of objects containing player_id (or id)
  const ids = (poolMembers || []).map(m => m.player_id || m.id).filter(Boolean);
  const rr = roundRobinRounds(ids);

  if (rr.length === 0) return [];

  // Take first N roundsWanted (deterministic). If roundsWanted > rr.length, wrap.
  const out = [];
  for (let i = 0; i < roundsWanted; i++) {
    out.push(rr[i % rr.length]);
  }
  return out; // array of rounds; each round is array of [idA, idB]
}

export function generateMonthlyPairings(pools, roundsPerMonth = 4) {
  // Returns: { roundInMonth: 1..4, pairs:[{p1,p2,pool}] }[]
  const rounds = Array.from({ length: roundsPerMonth }, (_, i) => ({
    roundInMonth: i + 1,
    pairs: [],
  }));

  (pools || []).forEach(pool => {
    const rrRounds = generatePairingsForPool(pool.members, roundsPerMonth);
    rrRounds.forEach((pairs, idx) => {
      pairs.forEach(([p1, p2]) => {
        rounds[idx].pairs.push({ p1, p2, pool: pool.poolIndex });
      });
    });
  });

  return rounds;
}

/* =========================================================
   TQ (Tournament Quanta)
   - Placement-based, deterministic
   - You can adjust buckets later without rewriting history
========================================================= */

export function computeTQ(baseValue, finishRank, fieldSize) {
  const N = Math.max(1, parseInt(fieldSize || 0, 10) || 0);
  const r = Math.max(1, parseInt(finishRank || 0, 10) || 0);
  const base = Math.max(0, parseInt(baseValue || 0, 10) || 0);

  // Default bucket multipliers (editable later)
  // Designed for common event sizes; works fine generally.
  let mult = 0.15;

  if (r === 1) mult = 1.00;
  else if (r === 2) mult = 0.85;
  else if (r <= 4) mult = 0.70;
  else if (r <= 8) mult = 0.55;
  else if (r <= Math.ceil(N / 2)) mult = 0.35;
  else mult = 0.15;

  return Math.round(base * mult);
}