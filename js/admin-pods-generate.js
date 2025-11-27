// /js/admin-pods-generate.js
//
// Admin-only page:
//  - Finds current league month (by date)
//  - Loads active signups & players
//  - Uses assignPods(...) to build pods
//  - Shows preview
//  - On save: clears old pods for that month, creates new pods + pod_members

import { supabase } from "/js/supabase.js";
import { getLocalSession } from "/js/session.js";
import { assignPods, podsToDbShape } from "/js/pods-utils.js";

const adminNameEl = document.getElementById("admin-name");
const podsInfoEl = document.getElementById("pods-info");
const podsWarningEl = document.getElementById("pods-warning");
const podsStatusEl = document.getElementById("pods-status");
const podsErrorEl = document.getElementById("pods-error");
const previewContainer = document.getElementById("pods-preview");
const generateBtn = document.getElementById("generate-btn");
const saveBtn = document.getElementById("save-btn");

let currentMonth = null;   // { id, name, season_id, start_date, end_date }
let currentSeason = null;  // { id, name, ... }
let currentPods = null;    // result of assignPods
let dbPodsShape = null;    // podsToDbShape

async function ensureAdmin() {
  const session = getLocalSession();
  if (!session || !session.playerId) {
    // No session: bounce to login
    window.location.href = "/login.html";
    return;
  }

  const { data, error } = await supabase
    .from("players")
    .select("full_name, is_admin, status")
    .eq("id", session.playerId)
    .single();

  if (error || !data) {
    podsErrorEl.textContent = "Unable to load admin profile.";
    podsErrorEl.classList.remove("hidden");
    throw new Error("not-admin");
  }

  adminNameEl.textContent = `Logged in as ${data.full_name}`;

  if (!data.is_admin) {
    podsErrorEl.textContent = "You must be an admin to view this page.";
    podsErrorEl.classList.remove("hidden");
    throw new Error("not-admin");
  }
}

/**
 * Find current league_month by today's date (UTC-ish).
 * We assume exactly one month is "active" at a time:
 *   start_date <= today <= end_date
 */
async function findCurrentMonth() {
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: months, error } = await supabase
    .from("league_months")
    .select("id, name, season_id, start_date, end_date")
    .lte("start_date", todayStr)
    .gte("end_date", todayStr)
    .limit(1);

  if (error) {
    throw error;
  }

  if (!months || months.length === 0) {
    throw new Error(
      "No active league month found. Check league_months start/end dates."
    );
  }

  return months[0];
}

/**
 * Load the season record for the given season_id, mainly for display.
 */
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
 * Load all active players for the current season:
 *   - league_signups.status = 'active'
 *   - players.status = 'active'
 */
async function loadActiveSeasonPlayers(seasonId) {
  // 1) Get active league_signups for this season
  const { data: signups, error: sErr } = await supabase
    .from("league_signups")
    .select("player_id, status")
    .eq("season_id", seasonId)
    .eq("status", "active");

  if (sErr) throw sErr;
  if (!signups || !signups.length) {
    return [];
  }

  const playerIds = signups.map((s) => s.player_id);

  // 2) Load player records
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, full_name, home_store, remote_preference, remote_location, remote_methods, status")
    .in("id", playerIds);

  if (pErr) throw pErr;

  // Filter to players whose own status is 'active'
  return (players || []).filter((p) => p.status === "active");
}

/**
 * Render pods preview into the page.
 */
function renderPodsPreview(pods) {
  previewContainer.innerHTML = "";

  if (!pods || !pods.length) {
    previewContainer.innerHTML =
      '<p class="text-sm text-slate-600">No players to show.</p>';
    return;
  }

  const colorMap = {
    Emerald: "border-emerald-600",
    Ruby: "border-red-600",
    Sapphire: "border-indigo-600",
    Pearl: "border-slate-400"
  };

  for (const pod of pods) {
    const podDiv = document.createElement("div");
    podDiv.className =
      "bg-white border rounded-xl shadow p-4 text-sm " +
      (colorMap[pod.label] || "border-slate-300");

    const title = document.createElement("h2");
    title.className = "text-base font-semibold mb-2";
    title.textContent = `Pod – ${pod.label}`;
    podDiv.appendChild(title);

    const list = document.createElement("ol");
    list.className = "list-decimal ml-5 space-y-1";

    for (const p of pod.players) {
      const li = document.createElement("li");
      const hs = p.home_store || "N/A";
      li.textContent = `${p.full_name} — ${hs}`;
      list.appendChild(li);
    }

    podDiv.appendChild(list);
    previewContainer.appendChild(podDiv);
  }
}

/**
 * Delete existing pods + pod_members for this month, then insert new ones.
 */
async function savePodsToDb(monthId, podsDbShape) {
  podsStatusEl.textContent = "Saving pods…";

  // Load existing pods for this month
  const { data: existingPods, error: exErr } = await supabase
    .from("pods")
    .select("id")
    .eq("month_id", monthId);

  if (exErr) throw exErr;

  const existingIds = (existingPods || []).map((p) => p.id);

  // Delete existing pod_members + pods if present
  if (existingIds.length) {
    const { error: pmDelErr } = await supabase
      .from("pod_members")
      .delete()
      .in("pod_id", existingIds);
    if (pmDelErr) throw pmDelErr;

    const { error: podsDelErr } = await supabase
      .from("pods")
      .delete()
      .in("id", existingIds);
    if (podsDelErr) throw podsDelErr;
  }

  // Insert new pods
  const podsToInsert = podsDbShape.map((p) => ({
    month_id: monthId,
    name: p.pod_label,
    max_players: 8
  }));

  const { data: insertedPods, error: insErr } = await supabase
    .from("pods")
    .insert(podsToInsert)
    .select("id, name");

  if (insErr) throw insErr;

  // Build map from label → pod id
  const podIdByLabel = {};
  for (const ip of insertedPods) {
    podIdByLabel[ip.name] = ip.id;
  }

  // Flatten pod_members
  const podMembersRows = [];
  for (const pod of podsDbShape) {
    const podId = podIdByLabel[pod.pod_label];
    if (!podId) continue;
    for (const playerId of pod.player_ids) {
      podMembersRows.push({
        pod_id: podId,
        player_id: playerId
      });
    }
  }

  if (podMembersRows.length) {
    const { error: pmInsErr } = await supabase
      .from("pod_members")
      .insert(podMembersRows);
    if (pmInsErr) throw pmInsErr;
  }

  podsStatusEl.textContent = "Pods saved successfully.";
}

/**
 * Main init
 */
async function init() {
  try {
    await ensureAdmin();

    podsStatusEl.textContent = "Finding current league month…";

    currentMonth = await findCurrentMonth();
    currentSeason = await loadSeason(currentMonth.season_id);

    podsInfoEl.textContent =
      `Current month: ${currentMonth.name} (${currentSeason.name}) ` +
      `· ${currentMonth.start_date} → ${currentMonth.end_date}`;

    podsWarningEl.textContent =
      "Running this will overwrite any existing pods for this month.";

    podsStatusEl.textContent = "Ready. Click “Generate Pods (Preview)” to begin.";
  } catch (err) {
    console.error(err);
    if (err.message === "not-admin") return;
    podsStatusEl.textContent = "";
    podsErrorEl.textContent = err.message || "Error loading page.";
    podsErrorEl.classList.remove("hidden");
  }
}

generateBtn?.addEventListener("click", async () => {
  if (!currentMonth) {
    podsErrorEl.textContent = "No active league month is set.";
    podsErrorEl.classList.remove("hidden");
    return;
  }

  podsErrorEl.classList.add("hidden");
  podsStatusEl.textContent = "Loading active players and generating pods…";
  saveBtn.disabled = true;

  try {
    const players = await loadActiveSeasonPlayers(currentMonth.season_id);

    if (!players.length) {
      podsStatusEl.textContent = "No active players found for this season.";
      renderPodsPreview([]);
      currentPods = null;
      dbPodsShape = null;
      return;
    }

    currentPods = assignPods(players, 8);
    dbPodsShape = podsToDbShape(currentPods);

    renderPodsPreview(currentPods);

    podsStatusEl.textContent =
      `Generated ${currentPods.length} pods for ${players.length} players. ` +
      `Review below, then click “Confirm & Save Pods” if you’re happy.`;

    saveBtn.disabled = false;
  } catch (err) {
    console.error(err);
    podsStatusEl.textContent = "";
    podsErrorEl.textContent = err.message || "Error generating pods.";
    podsErrorEl.classList.remove("hidden");
  }
});

saveBtn?.addEventListener("click", async () => {
  if (!currentMonth || !dbPodsShape) return;

  saveBtn.disabled = true;
  podsErrorEl.classList.add("hidden");

  try {
    await savePodsToDb(currentMonth.id, dbPodsShape);
  } catch (err) {
    console.error(err);
    podsStatusEl.textContent = "";
    podsErrorEl.textContent = err.message || "Error saving pods.";
    podsErrorEl.classList.remove("hidden");
  } finally {
    saveBtn.disabled = false;
  }
});

init();
