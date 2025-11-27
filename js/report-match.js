// /js/report-match.js
//
// Player-facing match report:
// - Only uses scheduled league_matches for the current month
// - Excludes BYEs and matches with a winner already set
// - Writes winner / draw flag into league_matches
// - Admin approval page then moves ratings & marks approved=true

import { supabase } from "/js/supabase.js";
import { getLocalSession } from "/js/session.js";

const playerLabelEl = document.getElementById("player-label");
const monthLabelEl = document.getElementById("month-label");
const matchSelect = document.getElementById("match-select");
const reportForm = document.getElementById("report-form");
const errorEl = document.getElementById("report-error");
const successEl = document.getElementById("report-success");
const submitBtn = document.getElementById("submit-btn");

let currentPlayer = null;       // players row
let currentMonth = null;        // league_months row
let podsById = {};              // pod_id -> pod row
let matches = [];               // league_matches rows for this player
let matchMetaById = {};         // id -> { isA, opponentId }

async function ensureLoggedIn() {
  const sess = getLocalSession();
  if (!sess || !sess.playerId) {
    window.location.href = "/login.html";
    return null;
  }

  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, rating")
    .eq("id", sess.playerId)
    .single();

  if (error || !data) {
    throw new Error("Could not load player profile.");
  }

  currentPlayer = data;
  playerLabelEl.textContent = `Reporting as ${data.full_name}`;
  return data;
}

async function findCurrentMonth() {
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("league_months")
    .select("id, name, season_id, start_date, end_date")
    .lte("start_date", todayStr)
    .gte("end_date", todayStr)
    .limit(1);

  if (error) throw error;
  if (!data || !data.length) {
    throw new Error("No active league month found.");
  }
  return data[0];
}

async function loadPodsForMonth(monthId) {
  const { data, error } = await supabase
    .from("pods")
    .select("id, name")
    .eq("month_id", monthId);

  if (error) throw error;
  const map = {};
  for (const p of data || []) {
    map[p.id] = p;
  }
  return map;
}

/**
 * Load scheduled matches for this player in the current month:
 * - approved = false
 * - winner is null
 * - player_a = me OR player_b = me
 * - player_b is not null (we skip BYEs here)
 */
async function loadMyPendingMatches(playerId, monthId) {
  const baseSelect =
    "id, pod_id, month_id, player_a, player_b, winner, k_factor, played_at, reported_by, approved, notes";

  const { data: asA, error: asAErr } = await supabase
    .from("league_matches")
    .select(baseSelect)
    .eq("month_id", monthId)
    .eq("approved", false)
    .is("winner", null)
    .not("player_b", "is", null)
    .eq("player_a", playerId);

  if (asAErr) throw asAErr;

  const { data: asB, error: asBErr } = await supabase
    .from("league_matches")
    .select(baseSelect)
    .eq("month_id", monthId)
    .eq("approved", false)
    .is("winner", null)
    .not("player_b", "is", null)
    .eq("player_b", playerId);

  if (asBErr) throw asBErr;

  const byId = {};
  for (const m of asA || []) byId[m.id] = m;
  for (const m of asB || []) byId[m.id] = m;

  return Object.values(byId);
}

/**
 * Load opponents for these matches.
 */
async function loadOpponentsForMatches(playerId, matches) {
  const opponentIds = new Set();

  matchMetaById = {};

  for (const m of matches) {
    const isA = m.player_a === playerId;
    const oppId = isA ? m.player_b : m.player_a;
    if (oppId) opponentIds.add(oppId);
    matchMetaById[m.id] = {
      isA,
      opponentId: oppId
    };
  }

  if (!opponentIds.size) return {};

  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, home_store")
    .in("id", Array.from(opponentIds));

  if (error) throw error;

  const map = {};
  for (const p of data || []) {
    map[p.id] = p;
  }
  return map;
}

function populateMatchSelect(matches, opponentsMap) {
  matchSelect.innerHTML = "";

  if (!matches.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No pending scheduled matches found.";
    matchSelect.appendChild(opt);
    matchSelect.disabled = true;
    submitBtn.disabled = true;
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a match to report…";
  matchSelect.appendChild(placeholder);

  for (const m of matches) {
    const meta = matchMetaById[m.id];
    const opp = opponentsMap[meta.opponentId];
    const oppName = opp?.full_name || "(unknown opponent)";
    const podName = podsById[m.pod_id]?.name || "Unknown Pod";

    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${oppName} — ${podName}`;
    matchSelect.appendChild(opt);
  }

  matchSelect.disabled = false;
  submitBtn.disabled = false;
}

/**
 * Map radio result code to winner / draw.
 *
 * codes:
 *  - ME_WIN_2_0, ME_WIN_2_1 => current player wins
 *  - ME_LOSE_1_2, ME_LOSE_0_2 => opponent wins
 *  - DRAW_1_1 => draw (winner null)
 */
function resolveOutcome(code, playerId, opponentId) {
  if (!code) return { winnerId: null, isDraw: false };

  if (code === "DRAW_1_1") {
    return { winnerId: null, isDraw: true };
  }

  if (code.startsWith("ME_WIN")) {
    return { winnerId: playerId, isDraw: false };
  }
  if (code.startsWith("ME_LOSE")) {
    return { winnerId: opponentId, isDraw: false };
  }

  return { winnerId: null, isDraw: false };
}

/**
 * Submit handler
 */
async function handleSubmit(e) {
  e.preventDefault();
  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  if (!currentPlayer || !currentMonth) {
    errorEl.textContent = "Not fully loaded yet. Try reloading the page.";
    errorEl.classList.remove("hidden");
    return;
  }

  const matchId = matchSelect.value;
  if (!matchId) {
    errorEl.textContent = "Please select a match to report.";
    errorEl.classList.remove("hidden");
    return;
  }

  const resultInput = /** @type {HTMLInputElement|null} */ (
    document.querySelector('input[name="result"]:checked')
  );
  if (!resultInput) {
    errorEl.textContent = "Please select a result.";
    errorEl.classList.remove("hidden");
    return;
  }

  const code = resultInput.value;
  const notesExtra = document.getElementById("notes").value.trim();

  const matchRow = matches.find((m) => m.id === matchId);
  if (!matchRow) {
    errorEl.textContent = "Selected match not found.";
    errorEl.classList.remove("hidden");
    return;
  }

  const meta = matchMetaById[matchRow.id];
  const opponentId = meta.opponentId;

  const { winnerId, isDraw } = resolveOutcome(
    code,
    currentPlayer.id,
    opponentId
  );

  // Build notes string
  let baseNote = code;
  baseNote += ` · reported by ${currentPlayer.full_name}`;
  if (isDraw) baseNote = `DRAW_${code} · reported by ${currentPlayer.full_name}`;
  if (notesExtra) baseNote += ` · ${notesExtra}`;

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  try {
    const { error } = await supabase
      .from("league_matches")
      .update({
        winner: winnerId,          // null if draw
        notes: baseNote,
        reported_by: currentPlayer.id,
        played_at: new Date().toISOString()
      })
      .eq("id", matchRow.id);

    if (error) {
      throw error;
    }

    successEl.textContent = "Match reported successfully. An admin will review and approve it.";
    successEl.classList.remove("hidden");

    // Remove this match from local list + dropdown
    matches = matches.filter((m) => m.id !== matchRow.id);
    populateMatchSelect(matches, {}); // will disable if list empty
  } catch (err) {
    console.error(err);
    errorEl.textContent = err.message || "Error submitting match report.";
    errorEl.classList.remove("hidden");
  } finally {
    submitBtn.disabled = !matches.length;
    submitBtn.textContent = "Submit match report";
  }
}

async function init() {
  try {
    await ensureLoggedIn();
    currentMonth = await findCurrentMonth();

    monthLabelEl.textContent =
      `Current league month: ${currentMonth.name} ` +
      `(${currentMonth.start_date} → ${currentMonth.end_date})`;

    podsById = await loadPodsForMonth(currentMonth.id);
    matches = await loadMyPendingMatches(currentPlayer.id, currentMonth.id);

    const opponents = await loadOpponentsForMatches(currentPlayer.id, matches);
    populateMatchSelect(matches, opponents);
  } catch (err) {
    console.error(err);
    errorEl.textContent = err.message || "Error loading report form.";
    errorEl.classList.remove("hidden");
    matchSelect.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Unable to load matches.";
    matchSelect.appendChild(opt);
    matchSelect.disabled = true;
    submitBtn.disabled = true;
  }
}

reportForm?.addEventListener("submit", handleSubmit);
init();
