// /js/admin-pairings-generate.js
//
// Admin-only page to generate league pairings for the current month.
// Uses existing pods + players, calls generatePairingsForPods, and writes into league_matches.

import { supabase } from "/js/supabase.js";
import { getLocalSession } from "/js/session.js";
import { generatePairingsForPods } from "/js/pairings-utils.js";

const adminNameEl = document.getElementById("admin-name");
const infoEl = document.getElementById("pairings-info");
const warningEl = document.getElementById("pairings-warning");
const statusEl = document.getElementById("pairings-status");
const errorEl = document.getElementById("pairings-error");
const previewEl = document.getElementById("pairings-preview");
const genBtn = document.getElementById("generate-pairings-btn");
const saveBtn = document.getElementById("save-pairings-btn");

let currentMonth = null;
let currentSeason = null;
let podsWithPlayers = null;
let generatedMatches = null; // { podId, playerAId, playerBId|null }[]
let leagueEventId = null;    // null for pure league

async function ensureAdmin() {
  const session = getLocalSession();
  if (!session || !session.playerId) {
    window.location.href = "/login.html";
    return;
  }

  const { data, error } = await supabase
    .from("players")
    .select("full_name, is_admin")
    .eq("id", session.playerId)
    .single();

  if (error || !data) {
    errorEl.textContent = "Unable to load admin profile.";
    errorEl.classList.remove("hidden");
    throw new Error("not-admin");
  }

  adminNameEl.textContent = `Logged in as ${data.full_name}`;

  if (!data.is_admin) {
    errorEl.textContent = "You must be an admin to view this page.";
    errorEl.classList.remove("hidden");
    throw new Error("not-admin");
  }
}

async function findCurrentMonth() {
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: months, error } = await supabase
    .from("league_months")
    .select("id, name, season_id, start_date, end_date")
    .lte("start_date", todayStr)
    .gte("end_date", todayStr)
    .limit(1);

  if (error) throw error;
  if (!months || !months.length) {
    throw new Error(
      "No active league month found. Check league_months start/end dates."
    );
  }
  return months[0];
}

async function loadSeason(seasonId) {
  const { data, error } = await supabase
    .from("league_seasons")
    .select("id, name, start_date, end_date")
    .eq("id", seasonId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Load pods for the current month, and the players in them.
 *
 * Returns:
 *   [
 *     {
 *       podId,
 *       label,
 *       players: [ { id, full_name, home_store, remote_preference, remote_methods } ]
 *     },
 *     ...
 *   ]
 */
async function loadPodsWithPlayers(monthId) {
  // Pods for this month
  const { data: pods, error: podsErr } = await supabase
    .from("pods")
    .select("id, name")
    .eq("month_id", monthId);

  if (podsErr) throw podsErr;
  if (!pods || !pods.length) {
    throw new Error("No pods found for this month. Generate pods first.");
  }

  const podIds = pods.map((p) => p.id);

  // Pod members
  const { data: members, error: memErr } = await supabase
    .from("pod_members")
    .select("pod_id, player_id");
  if (memErr) throw memErr;

  // Keep only current month pods
  const membersByPod = {};
  for (const p of pods) {
    membersByPod[p.id] = [];
  }
  for (const m of members || []) {
    if (membersByPod[m.pod_id]) {
      membersByPod[m.pod_id].push(m.player_id);
    }
  }

  // Load all distinct player_ids
  const playerIds = Array.from(
    new Set(Object.values(membersByPod).flat())
  );
  if (!playerIds.length) {
    throw new Error("No players found in pod_members.");
  }

  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, full_name, home_store, remote_preference, remote_methods")
    .in("id", playerIds);

  if (pErr) throw pErr;

  const playerById = {};
  for (const p of players || []) {
    playerById[p.id] = p;
  }

  const result = [];
  for (const pod of pods) {
    const ids = membersByPod[pod.id] || [];
    const list = [];
    for (const pid of ids) {
      const p = playerById[pid];
      if (p) list.push(p);
    }
    result.push({
      podId: pod.id,
      label: pod.name,
      players: list
    });
  }

  return result;
}

function renderPairingsPreview(pods, matches) {
  previewEl.innerHTML = "";

  // group matches by podId
  const matchesByPod = {};
  for (const m of matches) {
    if (!matchesByPod[m.podId]) matchesByPod[m.podId] = [];
    matchesByPod[m.podId].push(m);
  }

  // quick player lookup
  const playerLookup = {};
  for (const pod of pods) {
    for (const p of pod.players) {
      playerLookup[p.id] = p;
    }
  }

  const colorMap = {
    Emerald: "border-emerald-600",
    Ruby: "border-red-600",
    Sapphire: "border-indigo-600",
    Pearl: "border-slate-400"
  };

  for (const pod of pods) {
    const panel = document.createElement("div");
    panel.className =
      "bg-white border rounded-xl shadow p-4 text-sm mb-2 " +
      (colorMap[pod.label] || "border-slate-300");

    const title = document.createElement("h2");
    title.className = "text-base font-semibold mb-1";
    title.textContent = `Pod – ${pod.label}`;
    panel.appendChild(title);

    const matchList = document.createElement("ul");
    matchList.className = "space-y-1";

    const podMatches = matchesByPod[pod.podId] || [];
    if (!podMatches.length) {
      const li = document.createElement("li");
      li.textContent = "No matches generated.";
      matchList.appendChild(li);
    } else {
      for (const m of podMatches) {
        const a = playerLookup[m.playerAId];
        const b = m.playerBId ? playerLookup[m.playerBId] : null;

        const li = document.createElement("li");
        if (b) {
          li.textContent = `${a?.full_name || "?"} vs ${b?.full_name || "?"}`;
        } else {
          li.textContent = `${a?.full_name || "?"} — BYE`;
        }
        matchList.appendChild(li);
      }
    }

    panel.appendChild(matchList);
    previewEl.appendChild(panel);
  }
}

async function deletePendingMatches(monthId) {
  // Only delete *unapproved* matches for this month
  const { error } = await supabase
    .from("league_matches")
    .delete()
    .eq("month_id", monthId)
    .eq("approved", false);

  if (error) throw error;
}

/**
 * Save generatedMatches into league_matches.
 * - event_id = null (pure league)
 * - k_factor = null for now (applied when match is approved)
 * - winner = null (set on report/approval)
 */
async function savePairings(monthId, matches) {
  statusEl.textContent = "Saving pairings…";

  if (!matches.length) {
    statusEl.textContent = "No matches to save.";
    return;
  }

  await deletePendingMatches(monthId);

  const rows = matches.map((m) => ({
    month_id: monthId,
    pod_id: m.podId,
    player_a: m.playerAId,
    player_b: m.playerBId,   // null for BYE
    winner: null,
    k_factor: null,
    played_at: null,
    reported_by: null,
    approved: false,
    notes: m.playerBId ? "Auto-generated pairing" : "Auto-generated BYE"
  }));

  const { error } = await supabase
    .from("league_matches")
    .insert(rows);

  if (error) throw error;

  statusEl.textContent = "Pairings saved successfully.";
}

/**
 * Init
 */
async function init() {
  try {
    await ensureAdmin();

    statusEl.textContent = "Finding current league month…";

    currentMonth = await findCurrentMonth();
    currentSeason = await loadSeason(currentMonth.season_id);

    infoEl.textContent =
      `Current month: ${currentMonth.name} (${currentSeason.name}) ` +
      `· ${currentMonth.start_date} → ${currentMonth.end_date}`;

    warningEl.textContent =
      "This will overwrite any unapproved matches for this month. " +
      "Approved matches are never touched.";

    statusEl.textContent = "Ready. Click “Generate Pairings (Preview)”.";
  } catch (err) {
    console.error(err);
    if (err.message === "not-admin") return;
    statusEl.textContent = "";
    errorEl.textContent = err.message || "Error loading page.";
    errorEl.classList.remove("hidden");
  }
}

genBtn?.addEventListener("click", async () => {
  errorEl.classList.add("hidden");
  saveBtn.disabled = true;

  if (!currentMonth) {
    errorEl.textContent = "No active league month detected.";
    errorEl.classList.remove("hidden");
    return;
  }

  statusEl.textContent = "Loading pods and players…";

  try {
    podsWithPlayers = await loadPodsWithPlayers(currentMonth.id);

    const totalPlayers = podsWithPlayers.reduce(
      (sum, pod) => sum + pod.players.length,
      0
    );

    if (!totalPlayers) {
      statusEl.textContent = "No players found in pods.";
      renderPairingsPreview([], []);
      return;
    }

    statusEl.textContent = "Generating pairings…";

    generatedMatches = generatePairingsForPods(podsWithPlayers, 4);

    renderPairingsPreview(podsWithPlayers, generatedMatches);

    statusEl.textContent =
      `Generated ${generatedMatches.length} matches for ` +
      `${totalPlayers} players. Review below, then “Confirm & Save Pairings”.`;

    saveBtn.disabled = false;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "";
    errorEl.textContent = err.message || "Error generating pairings.";
    errorEl.classList.remove("hidden");
  }
});

saveBtn?.addEventListener("click", async () => {
  if (!currentMonth || !generatedMatches) return;

  saveBtn.disabled = true;
  errorEl.classList.add("hidden");

  try {
    await savePairings(currentMonth.id, generatedMatches);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "";
    errorEl.textContent = err.message || "Error saving pairings.";
    errorEl.classList.remove("hidden");
  } finally {
    saveBtn.disabled = false;
  }
});

init();
