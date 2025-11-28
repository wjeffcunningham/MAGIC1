import { supabase, getLocalSession, isAdmin } from "./session.js";

const adminContent = document.getElementById("admin-content");
const notAdmin = document.getElementById("not-admin");
const seasonEl = document.getElementById("season-name");
const monthEl = document.getElementById("month-name");

const previewBox = document.getElementById("preview");
const previewContent = document.getElementById("preview-content");

let season = null;
let month = null;
let signups = [];

main();

async function main() {
  const session = getLocalSession();
  if (!session) return deny();

  const admin = await isAdmin();
  if (!admin) return deny();

  adminContent.classList.remove("hidden");

  await loadActiveSeasonMonth();
  await loadActiveSignups();
  wireButtons();
}

function deny() {
  notAdmin.classList.remove("hidden");
  adminContent.classList.add("hidden");
}

function showPreview(text) {
  previewContent.textContent = text;
  previewBox.classList.remove("hidden");
}

// ------------------------------------------------------
// Load season + month
// ------------------------------------------------------
async function loadActiveSeasonMonth() {
  const { data: s } = await supabase
    .from("league_seasons")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (!s) return;
  season = s;
  seasonEl.textContent = s.name;

  const { data: m } = await supabase
    .from("league_months")
    .select("*")
    .eq("season_id", s.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!m) return;
  month = m;
  monthEl.textContent = m.name;
}

// ------------------------------------------------------
// Load active signups
// ------------------------------------------------------
async function loadActiveSignups() {
  if (!season) return;

  const { data } = await supabase
    .from("league_signups")
    .select("player:players(*)")
    .eq("season_id", season.id)
    .eq("status", "active");

  signups = data.map(r => r.player).filter(p => p.status === "active");
}

// ------------------------------------------------------
// Buttons
// ------------------------------------------------------
function wireButtons() {
  document.getElementById("test-pods-btn")
    .addEventListener("click", () => {
      const pods = generatePods(signups);
      showPreview(formatPodsPreview(pods));
    });

  document.getElementById("generate-pods-btn")
    .addEventListener("click", async () => {
      const pods = generatePods(signups);
      await savePodsToDB(pods);
      showPreview("Pods saved.");
    });

  document.getElementById("test-pairings-btn")
    .addEventListener("click", async () => {
      const pods = generatePods(signups);
      const pairs = generatePairings(pods);
      showPreview(formatPairingsPreview(pairs));
    });

  document.getElementById("generate-pairings-btn")
    .addEventListener("click", async () => {
      const pods = await loadPodsFromDB();
      const pairs = generatePairings(pods);
      await savePairingsToDB(pairs);
      showPreview("Pairings saved.");
    });
}

// ------------------------------------------------------
// POD GENERATION — balanced shuffle
// ------------------------------------------------------
const POD_NAMES = ["Emerald", "Sapphire", "Ruby", "Pearl"];

function generatePods(players) {
  const buckets = {
    "Stronghold Games": [],
    "The Connection Games": [],
    "Freelancer": [],
    "Remote Only": [],
  };

  players.forEach(p => {
    const hs = p.home_store || "Freelancer";
    buckets[hs]?.push(p);
  });

  for (const group of Object.values(buckets))
    group.sort(() => Math.random() - 0.5);

  const pods = POD_NAMES.map(name => ({
    name,
    players: []
  }));

  let index = 0;
  for (const group of Object.values(buckets)) {
    for (const player of group) {
      pods[index % pods.length].players.push(player);
      index++;
    }
  }

  return pods;
}

function formatPodsPreview(pods) {
  return pods.map(p =>
    `=== ${p.name} ===\n` +
    p.players.map(pl => `• ${pl.full_name}`).join("\n")
  ).join("\n\n");
}

// ------------------------------------------------------
// Save pods to DB
// ------------------------------------------------------
async function savePodsToDB(pods) {
  if (!month) return;

  await supabase.from("pods").delete().eq("month_id", month.id);

  for (const pod of pods) {
    const { data: inserted } = await supabase
      .from("pods")
      .insert({
        month_id: month.id,
        name: pod.name,
        max_players: 8
      })
      .select()
      .single();

    for (const pl of pod.players) {
      await supabase.from("pod_members").insert({
        pod_id: inserted.id,
        player_id: pl.id
      });
    }
  }
}

// ------------------------------------------------------
// Load pods from DB
// ------------------------------------------------------
async function loadPodsFromDB() {
  const { data } = await supabase
    .from("pods")
    .select("*, members:pod_members(player:players(*))")
    .eq("month_id", month.id);

  return data.map(p => ({
    name: p.name,
    players: p.members.map(m => m.player)
  }));
}

// ------------------------------------------------------
// PAIRINGS — 4-matches-per-player, no duplicates
// ------------------------------------------------------
function generatePairings(pods) {
  const pairings = [];

  for (const pod of pods) {
    const players = [...pod.players];
    const seen = new Set();

    for (const A of players) {
      // Pick 4 unique opponents
      const opponents = players
        .filter(p => p.id !== A.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 4);

      for (const B of opponents) {
        const key = A.id < B.id ? `${A.id}-${B.id}` : `${B.id}-${A.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        pairings.push({
          pod: pod.name,
          a: A,
          b: B
        });
      }
    }
  }

  return pairings;
}

function formatPairingsPreview(list) {
  return list
    .map(m => `${m.pod}: ${m.a.full_name} vs ${m.b.full_name}`)
    .join("\n");
}

// ------------------------------------------------------
// Save pairings to DB
// ------------------------------------------------------
async function savePairingsToDB(pairings) {
  if (!month) return;

  // Delete previous month pairings
  await supabase
    .from("league_matches")
    .delete()
    .eq("month_id", month.id)
    .eq("match_type", "monthly_pod");

  for (const m of pairings) {
    await supabase.from("league_matches").insert({
      month_id: month.id,
      pod_id: null,
      player_a: m.a.id,
      player_b: m.b.id,
      winner: m.a.id, // TEMP UNTIL ADMIN APPROVAL
      match_type: "monthly_pod",
      k_factor: 24,
      approved: false,
      reported_by: null,
      notes: null
    });
  }
}