// js/admin-pairings.js
//
// Admin controller for generating league pairings within pods
// for the active month.
//
// Uses:
//   - db.js (seasons/months/players)
//   - pods + pod_members via Supabase
//   - generatePairingsForPod() from pairings-utils.js
//

import { supabase } from "/js/supabase.js";
import {
  getActiveSeasonForToday,
  getMonthsForSeason,
  getPlayerById,
} from "/js/db.js";

import { generatePairingsForPod } from "/js/pairings-utils.js";
import { getLocalSession } from "/js/session.js";

const seasonLabelEl = document.getElementById("season-label");
const monthLabelEl  = document.getElementById("month-label");

const statusEl      = document.getElementById("pairings-status");
const errorEl       = document.getElementById("pairings-error");

const podsSummaryEl     = document.getElementById("pods-summary");
const existingPairingsEl = document.getElementById("existing-pairings");
const existingNoteEl     = document.getElementById("existing-pairings-note");

const testPreviewEl = document.getElementById("test-preview");

const btnTest      = document.getElementById("btn-test");
const btnGenerate  = document.getElementById("btn-generate");
const btnOverwrite = document.getElementById("btn-overwrite");

let activeSeason = null;
let activeMonth  = null;
let pods         = [];
let podMembers   = [];
let existingMatches = [];
let playersById  = {};

/**
 * Ensure the current user is admin.
 */
async function ensureAdmin() {
  const sess = getLocalSession();
  if (!sess || !sess.playerId) {
    window.location.href = "/login.html";
    return;
  }
  const me = await getPlayerById(sess.playerId);
  if (!me || !me.is_admin) {
    throw new Error("Admin access required.");
  }
}

/**
 * Load active season + month.
 */
async function loadSeasonAndMonth() {
  activeSeason = await getActiveSeasonForToday();
  if (!activeSeason) {
    statusEl.textContent = "No active league season.";
    btnTest.disabled = true;
    btnGenerate.disabled = true;
    btnOverwrite.disabled = true;
    return;
  }

  seasonLabelEl.textContent =
    `Season: ${activeSeason.name} (${activeSeason.start_date} → ${activeSeason.end_date})`;

  const months = await getMonthsForSeason(activeSeason.id);
  const today = new Date().toISOString().slice(0, 10);
  activeMonth =
    months.find(
      (m) => m.start_date <= today && m.end_date >= today
    ) || null;

  if (!activeMonth) {
    monthLabelEl.textContent = "Month: (no active league month)";
    btnTest.disabled = true;
    btnGenerate.disabled = true;
    btnOverwrite.disabled = true;
    return;
  }

  monthLabelEl.textContent =
    `Month: ${activeMonth.name} (${activeMonth.start_date} → ${activeMonth.end_date})`;
}

/**
 * Load pods + members for the active month.
 */
async function loadPodsAndMembers() {
  if (!activeMonth) return;

  const { data: podsData, error: podsErr } = await supabase
    .from("pods")
    .select("id, name, month_id")
    .eq("month_id", activeMonth.id);

  if (podsErr) {
    console.error(podsErr);
    throw new Error("Error loading pods.");
  }

  pods = podsData || [];
  podsSummaryEl.innerHTML = "";

  if (!pods.length) {
    podsSummaryEl.innerHTML =
      `<p class="text-xs text-slate-500 italic">No pods for this month. Generate pods first.</p>`;
    btnTest.disabled = true;
    btnGenerate.disabled = true;
    btnOverwrite.disabled = true;
    return;
  }

  const podIds = pods.map((p) => p.id);
  const { data: membersData, error: memErr } = await supabase
    .from("pod_members")
    .select("pod_id, player_id, players(id, full_name)")
    .in("pod_id", podIds);

  if (memErr) {
    console.error(memErr);
    throw new Error("Error loading pod members.");
  }

  podMembers = membersData || [];
  playersById = {};

  // Summaries
  const frag = document.createDocumentFragment();
  for (const pod of pods) {
    const members = podMembers.filter((m) => m.pod_id === pod.id);
    const names = members.map((m) => {
      const p = m.players;
      if (p) playersById[p.id] = p;
      return p?.full_name || "Unknown";
    });

    const card = document.createElement("div");
    card.className = "border rounded-lg p-2 bg-slate-50";
    card.innerHTML = `
      <div class="font-semibold mb-1 text-xs">${pod.name}</div>
      ${
        names.length
          ? `<ul class="space-y-0.5 text-[11px]">
               ${names.map((n) => `<li>${n}</li>`).join("")}
             </ul>`
          : `<p class="text-[11px] text-slate-500 italic">No members.</p>`
      }
    `;
    frag.appendChild(card);
  }
  podsSummaryEl.appendChild(frag);
}

/**
 * Load existing league_matches for this month.
 */
async function loadExistingPairings() {
  existingPairingsEl.innerHTML = "";

  if (!activeMonth) return;

  const { data: matches, error } = await supabase
    .from("league_matches")
    .select("id, pod_id, player_a, player_b, winner, approved")
    .eq("month_id", activeMonth.id);

  if (error) {
    console.error(error);
    throw new Error("Error loading existing pairings.");
  }

  existingMatches = matches || [];

  if (!existingMatches.length) {
    existingPairingsEl.innerHTML =
      `<p class="text-xs text-slate-500 italic">No pairings generated yet for this month.</p>`;
    existingNoteEl.textContent =
      "You can safely generate pairings for this month.";
    btnGenerate.disabled = false;
    btnOverwrite.classList.add("hidden");
    return;
  }

  // Group by pod
  const byPod = new Map();
  for (const m of existingMatches) {
    if (!byPod.has(m.pod_id)) byPod.set(m.pod_id, []);
    byPod.get(m.pod_id).push(m);
  }

  const frag = document.createDocumentFragment();
  for (const pod of pods) {
    const list = byPod.get(pod.id) || [];
    const card = document.createElement("div");
    card.className = "border rounded-lg p-2 bg-slate-50";
    card.innerHTML = `<div class="font-semibold mb-1 text-xs">${pod.name}</div>`;

    if (!list.length) {
      card.innerHTML +=
        `<p class="text-[11px] text-slate-500 italic">No matches in this pod.</p>`;
    } else {
      const ul = document.createElement("ul");
      ul.className = "space-y-0.5 text-[11px]";
      for (const m of list) {
        const aName = playersById[m.player_a]?.full_name || m.player_a;
        const bName = playersById[m.player_b]?.full_name || m.player_b;
        ul.innerHTML += `<li>${aName} vs ${bName}</li>`;
      }
      card.appendChild(ul);
    }

    frag.appendChild(card);
  }

  existingPairingsEl.appendChild(frag);
  existingNoteEl.textContent =
    "Pairings already exist. To regenerate, you must explicitly use 'Overwrite Existing Pairings'.";
  btnGenerate.disabled = true;
  btnOverwrite.classList.remove("hidden");
}

/**
 * Build players array per pod for use with pairings-utils.
 */
function getPlayersForPod(podId) {
  const members = podMembers.filter((m) => m.pod_id === podId);
  return members.map((m) => {
    const p = playersById[m.player_id] || m.players;
    return {
      id: m.player_id,
      full_name: p?.full_name || "Unknown",
      home_store: p?.home_store || null,
    };
  });
}

/**
 * Render test preview (no DB writes).
 */
function renderTestPreview(allPodMatches) {
  testPreviewEl.innerHTML = "";

  if (!allPodMatches.length) {
    testPreviewEl.innerHTML =
      `<p class="text-xs text-slate-500 italic">No pairings to preview.</p>`;
    return;
  }

  const byPod = new Map();
  for (const pm of allPodMatches) {
    if (!byPod.has(pm.pod.id)) byPod.set(pm.pod.id, []);
    byPod.get(pm.pod.id).push(pm);
  }

  const frag = document.createDocumentFragment();

  for (const pod of pods) {
    const list = byPod.get(pod.id) || [];
    const card = document.createElement("div");
    card.className = "border rounded-lg p-2 bg-slate-50";
    card.innerHTML = `<div class="font-semibold mb-1 text-xs">${pod.name}</div>`;

    if (!list.length) {
      card.innerHTML +=
        `<p class="text-[11px] text-slate-500 italic">No matches (empty pod).</p>`;
    } else {
      const ul = document.createElement("ul");
      ul.className = "space-y-0.5 text-[11px]";
      for (const item of list) {
        const aName = playersById[item.match.player_a]?.full_name || item.match.player_a;
        const bName = playersById[item.match.player_b]?.full_name || item.match.player_b;
        ul.innerHTML += `<li>${aName} vs ${bName}</li>`;
      }
      card.appendChild(ul);
    }

    frag.appendChild(card);
  }

  testPreviewEl.appendChild(frag);
}

/**
 * Compute test pairings for all pods (no save).
 */
function handleTestPairings() {
  const allPodMatches = [];

  for (const pod of pods) {
    const players = getPlayersForPod(pod.id);
    const matches = generatePairingsForPod(players, 4, pod.name);
    for (const m of matches) {
      allPodMatches.push({ pod, match: m });
    }
  }

  renderTestPreview(allPodMatches);
}

/**
 * Generate pairings and save to DB.
 * If overwrite=false and matches exist, we block (Option A).
 */
async function handleGeneratePairings(overwrite = false) {
  if (!activeMonth) {
    alert("No active month configured.");
    return;
  }

  if (existingMatches.length && !overwrite) {
    alert("Pairings already exist. Use 'Overwrite Existing Pairings' to replace them.");
    return;
  }

  statusEl.textContent = "Writing pairings to database…";

  // If overwriting, delete all matches for this month
  if (existingMatches.length && overwrite) {
    const { error: delErr } = await supabase
      .from("league_matches")
      .delete()
      .eq("month_id", activeMonth.id);

    if (delErr) {
      console.error(delErr);
      statusEl.textContent = "Error deleting existing pairings.";
      return;
    }
  }

  // Build inserts
  const inserts = [];
  for (const pod of pods) {
    const players = getPlayersForPod(pod.id);
    const matches = generatePairingsForPod(players, 4, pod.name);

    for (const m of matches) {
      inserts.push({
        pod_id: pod.id,
        month_id: activeMonth.id,
        player_a: m.player_a,
        player_b: m.player_b,
        winner: null,
        k_factor: 16, // league default
        approved: false,
      });
    }
  }

  if (!inserts.length) {
    statusEl.textContent = "No matches generated (empty pods?).";
    return;
  }

  const { error: insErr } = await supabase
    .from("league_matches")
    .insert(inserts);

  if (insErr) {
    console.error(insErr);
    statusEl.textContent = "Error inserting pairings.";
    return;
  }

  statusEl.textContent = "Pairings successfully generated for this month.";
  await loadExistingPairings();
}

/**
 * Init
 */
async function init() {
  try {
    await ensureAdmin();
    await loadSeasonAndMonth();
    await loadPodsAndMembers();
    await loadExistingPairings();

    btnTest.addEventListener("click", () => handleTestPairings());
    btnGenerate.addEventListener("click", () => handleGeneratePairings(false));
    btnOverwrite.addEventListener("click", () => handleGeneratePairings(true));
  } catch (err) {
    console.error(err);
    errorEl.textContent = err.message || "Error loading pairings admin.";
    errorEl.classList.remove("hidden");
  }
}

init();