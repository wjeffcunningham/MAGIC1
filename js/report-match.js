import { supabase } from "./supabase.js";
import { requireSession } from "./session.js";

const session = requireSession();

const currentNameEl = document.getElementById("current-name");
const currentUserEl = document.getElementById("current-username");
const monthSelect = document.getElementById("month-select");
const oppSelect = document.getElementById("opponent-select");
const podWarning = document.getElementById("pod-warning");
const form = document.getElementById("report-form");
const errEl = document.getElementById("report-error");
const okEl = document.getElementById("report-success");

let months = [];
let userPodsByMonth = {}; // month_id -> pod_id or null
let playersById = {};

// init UI name
currentNameEl.textContent = session.fullName;
currentUserEl.textContent = session.username;

// Load months, pods, players
async function init() {
  errEl.classList.add("hidden");
  okEl.classList.add("hidden");

  // 1) Months (just take all league_months)
  const { data: monthRows, error: mErr } = await supabase
    .from("league_months")
    .select("id, name, start_date, month_index")
    .order("month_index");

  if (mErr) {
    errEl.textContent = "Error loading months.";
    errEl.classList.remove("hidden");
    return;
  }

  months = monthRows || [];
  monthSelect.innerHTML = '<option value="">Select month…</option>';
  for (const m of months) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    monthSelect.appendChild(opt);
  }

  // 2) Determine the user's pod for each month (if any)
  //    pods -> pod_members
  const { data: podMembers, error: pmErr } = await supabase
    .from("pod_members")
    .select(`
      pod_id,
      pods ( id, month_id )
    `)
    .eq("player_id", session.playerId);

  if (pmErr) {
    // not fatal; they just won't be allowed if no pod for that month
    console.warn("Error loading pod memberships", pmErr);
  }

  userPodsByMonth = {};
  if (podMembers) {
    for (const row of podMembers) {
      const pod = row.pods;
      if (pod && pod.month_id) {
        userPodsByMonth[pod.month_id] = pod.id;
      }
    }
  }

  // 3) Load all players (for now, all players in the table; we can filter to active later)
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, full_name, username")
    .order("full_name");

  if (pErr) {
    errEl.textContent = "Error loading players.";
    errEl.classList.remove("hidden");
    return;
  }

  playersById = {};
  oppSelect.innerHTML = '<option value="">Select opponent…</option>';
  for (const p of players) {
    if (p.id === session.playerId) {
      playersById[p.id] = p;
      continue;
    }
    playersById[p.id] = p;
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.full_name + (p.username ? ` (${p.username})` : "");
    oppSelect.appendChild(opt);
  }

  monthSelect.addEventListener("change", onMonthChange);
}

function onMonthChange() {
  const monthId = monthSelect.value;
  if (!monthId) {
    podWarning.classList.add("hidden");
    return;
  }
  const podId = userPodsByMonth[monthId] || null;
  if (!podId) {
    podWarning.classList.remove("hidden");
  } else {
    podWarning.classList.add("hidden");
  }
}

// Submit handler
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errEl.classList.add("hidden");
  okEl.classList.add("hidden");

  const formData = new FormData(form);
  const monthId = formData.get("month_id");
  const opponentId = formData.get("opponent_id");
  const winnerChoice = formData.get("winner");
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!monthId) {
    errEl.textContent = "Please select a month.";
    errEl.classList.remove("hidden");
    return;
  }
  if (!opponentId) {
    errEl.textContent = "Please select an opponent.";
    errEl.classList.remove("hidden");
    return;
  }

  const podId = userPodsByMonth[monthId] || null;
  if (!podId) {
    errEl.textContent =
      "You are not assigned to a pod for this month; cannot report matches for it.";
    errEl.classList.remove("hidden");
    return;
  }

  const winnerId =
    winnerChoice === "me" ? session.playerId : opponentId;

  const { error: insErr } = await supabase.from("league_matches").insert({
    pod_id: podId,
    month_id: monthId,
    player_a: session.playerId,
    player_b: opponentId,
    winner: winnerId,
    k_factor: 24,
    reported_by: session.playerId,
    notes,
    approved: false,
  });

  if (insErr) {
    console.error(insErr);
    errEl.textContent = "Error submitting match.";
    errEl.classList.remove("hidden");
    return;
  }

  okEl.textContent = "Match submitted for approval.";
  okEl.classList.remove("hidden");
  form.reset();
  podWarning.classList.add("hidden");
});

init();