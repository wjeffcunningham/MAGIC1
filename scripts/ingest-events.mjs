/* =========================================================
   Historical Event Ingestion — PATCHED (deterministic)
   - Reads local JSON files
   - Upserts events (uuid id)
   - Replaces matches per event
   - Writes match_date + match_index
   - Derives winner from games/result where needed
   - Ingests byes
   - Calls rebuild_leaderboards()
========================================================= */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   CONFIG
========================================================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const EVENT_FILES = [
  "leaguetracker/data/raw/events/bcpmm-2026-01-10.json",
  "leaguetracker/data/raw/events/connections-2026-01-12.json",
  "leaguetracker/data/raw/events/connections-2026-01-26.json",
  "leaguetracker/data/raw/events/connections-2026-02-09.json",
  "leaguetracker/data/raw/events/stronghold-2026-02-01.json",
  "leaguetracker/data/raw/events/bcwl-2026-01-26-r1.json",
  "leaguetracker/data/raw/events/bcwl-2026-02-02-r2.json"
];

/* =========================================================
   Helpers
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

function deriveWinner({ playerA, playerB, gamesA, gamesB, result, winner }) {
  if (result === "D") return null;

  if (winner) return winner;

  const a = Number(gamesA);
  const b = Number(gamesB);
  if (Number.isFinite(a) && Number.isFinite(b)) {
    if (a > b) return playerA;
    if (b > a) return playerB;
  }

  return null;
}

function isDraw({ result, gamesA, gamesB }) {
  if (result === "D") return true;
  const a = Number(gamesA);
  const b = Number(gamesB);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function swissRoundNum(roundObj) {
  // Support both formats: { round: 1 } or { round_number: 1 }
  return roundObj.round_number ?? roundObj.round ?? 0;
}

function elimRoundNumber(swissMax, phaseKey) {
  // For a 5-round swiss: top8=6, semis=7, finals=8
  const order = { top8: 1, quarterfinals: 1, semifinals: 2, finals: 3 };
  return swissMax + (order[phaseKey] ?? 99);
}

/* =========================================================
   Ingest Single File
========================================================= */

async function getOrCreateEventId({ name, event_date, series }) {
  // Try to find an existing event row (avoid duplicates)
  const { data: existing, error: selErr } = await supabase
    .from("events")
    .select("id")
    .eq("name", name)
    .eq("event_date", event_date)
    .eq("series", series)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing?.id) return existing.id;

  // Insert new
  const { data: inserted, error: insErr } = await supabase
    .from("events")
    .insert({ name, event_date, series })
    .select("id")
    .single();

  if (insErr) throw insErr;
  return inserted.id;
}

async function ingestFile(filename) {
  console.log(`\nIngesting ${filename}`);

  const fullPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(fullPath)) {
    console.log("File not found:", fullPath);
    return;
  }

  const json = JSON.parse(fs.readFileSync(fullPath, "utf8"));

  const eventName = json.event?.name || filename;
  const eventDate = json.event?.date;
  const series = normalizeSeries(json.event?.series);

  if (!eventDate || !series) {
    console.log("Skipping (missing date/series)");
    return;
  }

  const eventId = await getOrCreateEventId({
    name: eventName,
    event_date: eventDate,
    series
  });

  // Replace matches for this event
  await supabase.from("matches").delete().eq("event_id", eventId);

  const matchRows = [];
  let matchIndex = 0;

  const rounds = Array.isArray(json.rounds) ? [...json.rounds] : [];
  rounds.sort((a, b) => swissRoundNum(a) - swissRoundNum(b));

  const swissMax = rounds.reduce((mx, r) => Math.max(mx, swissRoundNum(r)), 0);

  // Swiss matches + byes
  for (const round of rounds) {
    const rn = swissRoundNum(round);

    const matches = Array.isArray(round.matches) ? [...round.matches] : [];
    matches.sort((a, b) => (a.table ?? 0) - (b.table ?? 0));

    for (const m of matches) {
      const draw = isDraw(m);
      const winner = deriveWinner(m);

      matchRows.push({
        event_id: eventId,
        match_date: eventDate,
        match_index: matchIndex++,
        round_number: rn,
        is_elimination: false,
        player_a: m.playerA,
        player_b: m.playerB,
        games_a: draw ? 0 : (m.gamesA ?? null),
        games_b: draw ? 0 : (m.gamesB ?? null),
        winner
      });
    }

    // Byes
    const byes = Array.isArray(round.byes) ? round.byes : [];
    for (const p of byes) {
      matchRows.push({
        event_id: eventId,
        match_date: eventDate,
        match_index: matchIndex++,
        round_number: rn,
        is_elimination: false,
        player_a: p,
        player_b: null,
        games_a: null,
        games_b: null,
        winner: p
      });
    }
  }

  // Elimination phases in deterministic order
  const elim = json.elimination || null;
  if (elim && typeof elim === "object") {
    const phases = ["top8", "quarterfinals", "semifinals", "finals"];

    for (const phaseKey of phases) {
      if (!Array.isArray(elim[phaseKey])) continue;

      const rn = elimRoundNumber(swissMax, phaseKey);
      const matches = [...elim[phaseKey]];
      matches.sort((a, b) => (a.table ?? 0) - (b.table ?? 0));

      for (const m of matches) {
        const draw = isDraw(m);
        const winner = deriveWinner(m);

        matchRows.push({
          event_id: eventId,
          match_date: eventDate,
          match_index: matchIndex++,
          round_number: rn,
          is_elimination: true,
          player_a: m.playerA,
          player_b: m.playerB,
          games_a: draw ? 0 : (m.gamesA ?? null),
          games_b: draw ? 0 : (m.gamesB ?? null),
          winner
        });
      }
    }
  }

  if (matchRows.length) {
    const { error: matchErr } = await supabase.from("matches").insert(matchRows);
    if (matchErr) throw matchErr;
  }

  console.log(`Inserted ${matchRows.length} matches for event_id=${eventId}`);
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  for (const file of EVENT_FILES) {
    await ingestFile(file);
  }

  console.log("\nRebuilding leaderboards...");
  const { error } = await supabase.rpc("rebuild_leaderboards");
  if (error) throw error;

  console.log("Leaderboards rebuilt.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});