// js/admin-pods.js
//
// Admin pod assignment controller.
// Uses:
//   - db.js for seasons/months/signups
//   - pods-utils.js for the actual algorithm
//   - Supabase directly to write pods + pod_members
//

import { supabase } from "/js/supabase.js";
import {
  getActiveSeasonForToday,
  getMonthsForSeason,
  listActiveSignupsForSeason,
  getPlayerById,
} from "/js/db.js";

import { generatePodsForPlayers, POD_NAMES } from "/js/pods-utils.js";
import { getLocalSession } from "/js/session.js";

const seasonLabelEl = document.getElementById("season-label");
const monthLabelEl = document.getElementById("month-label");
const podsStatusEl = document.getElementById("pods-status");
const podsErrorEl = document.getElementById("pods-error");

const signupListEl = document.getElementById("signup-list");
const existingPodsEl = document.getElementById("existing-pods");
const existingPodsNoteEl = document.getElementById("existing-pods-note");

const testPreviewEl = document.getElementById("test-preview");

const btnTest = document.getElementById("btn-test");
const btnGenerate = document.getElementById("btn-generate");
const btnOverwrite = document.getElementById("btn-overwrite");

let activeSeason = null;
let activeMonth = null;
let activeSignups = [];
let existingPods = [];
let playersById = {};

/**
 * Ensure current user is admin.
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
 * Load active season + current month (today within).
 */
async function loadSeasonAndMonth() {
  activeSeason = await getActiveSeasonForToday();
  if (!activeSeason) {
    podsStatusEl.textContent = "No active league season.";
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
  } else {
    monthLabelEl.textContent =
      `Month: ${activeMonth.name} (${activeMonth.start_date} → ${activeMonth.end_date})`;
  }
}

/**
 * Load active signups for the season + players map.
 */
async function loadActiveSignups() {
  if (!activeSeason) return;

  const signups = await listActiveSignupsForSeason(activeSeason.id);
  activeSignups = signups;

  signupListEl.innerHTML = "";

  if (!signups.length) {
    signupListEl.innerHTML =
      `<p class="text-xs text-slate-500 italic">No active league signups for this season.</p>`;
    return;
  }

  const frag = document.createDocumentFragment();
  playersById = {};

  for (const s of signups) {
    const p = s.player;
    if (!p) continue;

    playersById[p.id] = p;

    const div = document.createElement("div");
    div.className = "flex justify-between gap-2";
    div.innerHTML = `
      <span>${p.full_name}</span>
      <span class="text-[10px] text-slate-500">
        ${p.home_store || "No store"}
      </span>
    `;
    frag.appendChild(div);
  }

  signupListEl.appendChild(frag);
}

/**
 * Load existing pods + memberships for the active month.
 */
async function loadExistingPods() {
  existingPodsEl.innerHTML = "";

  if (!activeMonth) {
    podsStatusEl.textContent = "No active month; pods cannot be assigned.";
    btnTest.disabled = true;
    btnGenerate.disabled = true;
    btnOverwrite.disabled = true;
    return;
  }

  const { data: pods, error: podsErr } = await supabase
    .from("pods")
    .select("id, name")
    .eq("month_id", activeMonth.id);

  if (podsErr) {
    console.error(podsErr);
    podsStatusEl.textContent = "Error loading existing pods.";
    return;
  }

  if (!pods.length) {
    podsStatusEl.textContent = "No pods exist yet for this month.";
    existingPodsNoteEl.textContent =
      "No existing pods. You can safely generate pods for this month.";
    btnGenerate.disabled = false;
    btnOverwrite.classList.add("hidden");
    existingPods = [];
    return;
  }

  // Load pod_members joined to players
  const podIds = pods.map((p) => p.id);
  const { data: members, error: memErr } = await supabase
    .from("pod_members")
    .select("pod_id, player_id, players(full_name)")
    .in("pod_id", podIds);

  if (memErr) {
    console.error(memErr);
    podsStatusEl.textContent = "Error loading pod members.";
    return;
  }

  existingPods = pods.map((p) => ({
    id: p.id,
    name: p.name,
    members: members
      .filter((m) => m.pod_id === p.id)
      .map((m) => m.players?.full_name || "Unknown"),
  }));

  // Render
  const frag = document.createDocumentFragment();
  for (const pod of existingPods) {
    const card = document.createElement("div");
    card.className = "border rounded-lg p-2 bg-slate-50";
    card.innerHTML = `
      <div class="font-semibold mb-1 text-xs">${pod.name}</div>
      ${
        pod.members.length
          ? `<ul class="space-y-0.5 text-[11px]">
               ${pod.members
                 .map((name) => `<li>${name}</li>`)
                 .join("")}
             </ul>`
          : `<p class="text-[11px] text-slate-500 italic">No members.</p>`
      }
    `;
    frag.appendChild(card);
  }
  existingPodsEl.appendChild(frag);

  podsStatusEl.textContent = `Pods already exist for this month.`;
  existingPodsNoteEl.textContent =
    "Pods exist. To regenerate, you must explicitly use 'Overwrite Existing Pods'.";
  btnGenerate.disabled = true;
  btnOverwrite.classList.remove("hidden");
}

/**
 * Helper: build simple players array for pods-utils from activeSignups.
 */
function buildPlayersArrayFromSignups() {
  const players = [];
  for (const s of activeSignups) {
    if (!s.player) continue;
    players.push({
      id: s.player.id,
      full_name: s.player.full_name,
      home_store: s.player.home_store,
    });
  }
  return players;
}

/**
 * Render a pod-layout into a given container (for test preview).
 */
function renderPodsPreview(pods, container) {
  container.innerHTML = "";

  if (!pods.length) {
    container.innerHTML =
      `<p class="text-xs text-slate-500 italic">No players to assign.</p>`;
    return;
  }

  const frag = document.createDocumentFragment();

  for (const pod of pods) {
    const card = document.createElement("div");
    card.className = "border rounded-lg p-2 bg-slate-50";
    card.innerHTML = `
      <div class="font-semibold mb-1 text-xs">${pod.name}</div>
      ${
        pod.members.length
          ? `<ul class="space-y-0.5 text-[11px]">
               ${pod.members
                 .map((id) => playersById[id]?.full_name || id)
                 .join("</li><li>")}
             </ul>`
          : `<p class="text-[11px] text-slate-500 italic">No members.</p>`
      }
    `;
    frag.appendChild(card);
  }

  container.appendChild(frag);
}

/**
 * Test pods: no DB writes.
 */
function handleTestPods() {
  const players = buildPlayersArrayFromSignups();
  const pods = generatePodsForPlayers(players, "test-seed");
  renderPodsPreview(pods, testPreviewEl);
}

/**
 * Generate pods in DB for this month.
 * If overwrite = false and pods exist, we block (Option A).
 */
async function handleGeneratePods(overwrite = false) {
  if (!activeMonth) {
    alert("No active month configured.");
    return;
  }

  // If there are existing pods and we are not overwriting, block.
  if (existingPods.length && !overwrite) {
    alert(
      "Pods already exist for this month. Use 'Overwrite Existing Pods' if you want to replace them."
    );
    return;
  }

  podsStatusEl.textContent = "Writing pods to database…";

  // If overwriting, delete existing pods (cascade deletes pod_members)
  if (existingPods.length && overwrite) {
    const podIds = existingPods.map((p) => p.id);
    const { error: delErr } = await supabase
      .from("pods")
      .delete()
      .in("id", podIds);

    if (delErr) {
      console.error(delErr);
      podsStatusEl.textContent = "Error deleting existing pods.";
      return;
    }
  }

  const players = buildPlayersArrayFromSignups();
  const pods = generatePodsForPlayers(players);

  // Insert pods
  const podsInserts = pods.map((pod) => ({
    month_id: activeMonth.id,
    name: pod.name,
    max_players: pod.members.length || 8,
  }));

  const { data: newPods, error: podsErr } = await supabase
    .from("pods")
    .insert(podsInserts)
    .select("id, name");

  if (podsErr) {
    console.error(podsErr);
    podsStatusEl.textContent = "Error inserting pods.";
    return;
  }

  // Map pod name -> id
  const nameToId = {};
  for (const p of newPods || []) {
    nameToId[p.name] = p.id;
  }

  // Insert pod_members
  const membersInserts = [];
  for (const pod of pods) {
    const podId = nameToId[pod.name];
    if (!podId) continue;
    for (const pid of pod.members) {
      membersInserts.push({
        pod_id: podId,
        player_id: pid,
      });
    }
  }

  if (membersInserts.length) {
    const { error: memErr } = await supabase
      .from("pod_members")
      .insert(membersInserts);

    if (memErr) {
      console.error(memErr);
      podsStatusEl.textContent =
        "Error inserting pod members (pods may be partially written).";
      return;
    }
  }

  podsStatusEl.textContent = "Pods successfully generated for this month.";
  await loadExistingPods(); // refresh view
}

/**
 * Init
 */
async function init() {
  try {
    await ensureAdmin();
    await loadSeasonAndMonth();
    await loadActiveSignups();
    await loadExistingPods();

    btnTest.addEventListener("click", () => handleTestPods());
    btnGenerate.addEventListener("click", () => handleGeneratePods(false));
    btnOverwrite.addEventListener("click", () => handleGeneratePods(true));
  } catch (err) {
    console.error(err);
    podsErrorEl.textContent = err.message || "Error loading pods admin.";
    podsErrorEl.classList.remove("hidden");
  }
}

init();