// report-match.js — player-facing match reporting

import { supabase } from "./supabase.js";
import { getLocalSession } from "./session.js";

const statusEl   = document.getElementById("report-status");
const errorEl    = document.getElementById("report-error");
const successEl  = document.getElementById("report-success");
const form       = document.getElementById("report-form");
const opponentSelect   = document.getElementById("opponent-select");
const externalInput    = document.getElementById("external-opponent");
const eventSelect      = document.getElementById("event-select");
const notesInput       = document.getElementById("notes");
const submitBtn        = document.getElementById("submit-btn");

let session = null;
let activeMonth = null;
let playerPodId = null;

// -----------------------------
// Helpers
// -----------------------------
function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
  successEl.classList.add("hidden");
}

function showSuccess(msg) {
  successEl.textContent = msg;
  successEl.classList.remove("hidden");
  errorEl.classList.add("hidden");
}

function clearMessages() {
  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");
}

// Find active league month based on today's date
async function fetchActiveMonth() {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("league_months")
    .select("id, name, start_date, end_date")
    .lte("start_date", today)
    .gte("end_date", today)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

// Find pod for this player in the active month
async function fetchPlayerPod(monthId, playerId) {
  // 1. Pods for the given month
  const { data: pods, error: podsErr } = await supabase
    .from("pods")
    .select("id")
    .eq("season_id", activeMonth.season_id)
    .eq("month_id", monthId);

  // If your pods table does not have season_id, remove that eq() line.
  // If this errors, fall back to just month_id.
  let podIds = [];
  if (podsErr || !pods?.length) {
    const { data: pods2 } = await supabase
      .from("pods")
      .select("id")
      .eq("month_id", monthId);
    podIds = (pods2 || []).map((p) => p.id);
  } else {
    podIds = pods.map((p) => p.id);
  }

  if (podIds.length === 0) return null;

  // 2. Pod membership for this player in those pods
  const { data: member, error: memberErr } = await supabase
    .from("pod_members")
    .select("pod_id")
    .in("pod_id", podIds)
    .eq("player_id", playerId)
    .maybeSingle();

  if (memberErr || !member) return null;
  return member.pod_id;
}

// Load opponent list (all registered players except self)
async function loadOpponents() {
  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, rating")
    .order("full_name", { ascending: true });

  if (error) {
    showError("Error loading players list.");
    opponentSelect.innerHTML = `<option value="">Error loading players</option>`;
    return;
  }

  const others = (data || []).filter((p) => p.id !== session.playerId);

  opponentSelect.innerHTML = `
    <option value="">Select opponent…</option>
    ${others
      .map(
        (p) => `
        <option value="${p.id}">
          ${p.full_name} (Rating ${p.rating ?? 1600})
        </option>`
      )
      .join("")}
    <option value="__external">External opponent (not listed)</option>
  `;
}

// Load events to populate match type/options
async function loadEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, k_factor, event_date")
    .order("event_date", { ascending: true });

  if (error) {
    // Leave only league option if events fail
    return;
  }

  // Append event options
  for (const ev of data || []) {
    const opt = document.createElement("option");
    opt.value = ev.id;
    const dateStr = ev.event_date || "";
    opt.textContent = `${ev.name} ${dateStr ? "· " + dateStr : ""} (K=${ev.k_factor})`;
    eventSelect.appendChild(opt);
  }
}

// Map radio result → DB fields
function interpretResult(value) {
  switch (value) {
    case "A_WIN_2_0":
      return { result: "A_WIN", games_a: 2, games_b: 0 };
    case "A_WIN_2_1":
      return { result: "A_WIN", games_a: 2, games_b: 1 };
    case "B_WIN_2_1":
      return { result: "B_WIN", games_a: 1, games_b: 2 };
    case "B_WIN_2_0":
      return { result: "B_WIN", games_a: 0, games_b: 2 };
    case "DRAW_1_1":
      return { result: "DRAW", games_a: 1, games_b: 1 };
    default:
      return null;
  }
}

// Create external opponent row if needed
async function ensureExternalOpponent(name) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("External opponent name is required.");
  }

  const { data, error } = await supabase
    .from("players")
    .insert({
      full_name: trimmed,
      email: null,
      home_store: null,
      remote_preference: "no_remote",
      play_style: "competitive",
      rating: 1600,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Error creating external opponent.");
  }
  return data.id;
}

// -----------------------------
// Submit handler
// -----------------------------
async function handleSubmit(e) {
  e.preventDefault();
  clearMessages();

  if (!activeMonth || !playerPodId) {
    showError("No active league month or pod found; contact the organizer.");
    return;
  }

  // Opponent
  const oppValue = opponentSelect.value;
  if (!oppValue) {
    showError("Please select an opponent.");
    return;
  }

  let opponentId = null;

  try {
    if (oppValue === "__external") {
      opponentId = await ensureExternalOpponent(externalInput.value || "");
    } else {
      opponentId = oppValue;
    }
  } catch (err) {
    showError(err.message || "Error handling external opponent.");
    return;
  }

  // Result radio
  const resultRadio = form.querySelector('input[name="result"]:checked');
  if (!resultRadio) {
    showError("Please select a result.");
    return;
  }

  const interp = interpretResult(resultRadio.value);
  if (!interp) {
    showError("Invalid result selection.");
    return;
  }

  // Event selection
  const eventId = eventSelect.value || null;

  // Notes
  const notes = notesInput.value.trim() || null;

  // Build match row
  const payload = {
    pod_id: playerPodId,
    month_id: activeMonth.id,
    player_a: session.playerId,
    player_b: opponentId,
    winner:
      interp.result === "A_WIN"
        ? session.playerId
        : interp.result === "B_WIN"
        ? opponentId
        : null,
    result: interp.result,
    games_won_a: interp.games_a,
    games_won_b: interp.games_b,
    event_id: eventId,
    approved: false,
    rejected: false,
    reported_by: session.playerId,
    notes,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  const { error } = await supabase
    .from("league_matches")
    .insert(payload);

  submitBtn.disabled = false;
  submitBtn.textContent = "Submit match report";

  if (error) {
    console.error(error);
    showError("Error saving match report.");
    return;
  }

  showSuccess("Match reported successfully. It will count for standings now and update ratings after admin approval.");
  form.reset();
  externalInput.classList.add("hidden");
}

// -----------------------------
// Init
// -----------------------------
async function init() {
  // 1. Require a logged-in session
  session = getLocalSession();
  if (!session) {
    window.location.href = "/login.html?next=/report-match.html";
    return;
  }

  statusEl.textContent = "Loading league month and pod…";

  // 2. Active league month
  activeMonth = await fetchActiveMonth();
  if (!activeMonth) {
    showError("No active league month found. Contact the organizer.");
    statusEl.textContent = "No active league month.";
    return;
  }

  // 3. Player's pod for this month
  playerPodId = await fetchPlayerPod(activeMonth.id, session.playerId);
  if (!playerPodId) {
    showError("You are not assigned to a pod for this league month.");
    statusEl.textContent = "No pod assignment.";
    return;
  }

  statusEl.textContent = `Reporting matches for ${activeMonth.name}.`;

  // 4. Load opponents + events
  await Promise.all([loadOpponents(), loadEvents()]);

  // 5. Opponent dropdown behavior
  opponentSelect.addEventListener("change", () => {
    if (opponentSelect.value === "__external") {
      externalInput.classList.remove("hidden");
    } else {
      externalInput.classList.add("hidden");
      externalInput.value = "";
    }
  });

  // 6. Form submit
  form.addEventListener("submit", handleSubmit);
}

init();