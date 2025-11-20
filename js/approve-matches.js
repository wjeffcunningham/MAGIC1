import { supabase } from "./supabase.js";
import { requireSession } from "./session.js";
import { computeElo } from "./elo.js";

// NOTE: no role-check yet; we just require login and assume only admin visits this page
requireSession();

const container = document.getElementById("pending-container");
const errEl = document.getElementById("admin-error");

async function loadPending() {
  errEl.classList.add("hidden");
  container.innerHTML = "<p class='text-sm text-slate-600'>Loading…</p>";

  // 1) Load unapproved matches
  const { data: matches, error: mErr } = await supabase
    .from("league_matches")
    .select("*")
    .eq("approved", false)
    .order("played_at", { ascending: false });

  if (mErr) {
    errEl.textContent = "Error loading matches.";
    errEl.classList.remove("hidden");
    return;
  }

  if (!matches || matches.length === 0) {
    container.innerHTML =
      "<p class='text-sm text-slate-600'>No pending matches.</p>";
    return;
  }

  // Collect IDs for join data
  const playerIds = new Set();
  const monthIds = new Set();
  const podIds = new Set();

  for (const m of matches) {
    playerIds.add(m.player_a);
    playerIds.add(m.player_b);
    playerIds.add(m.winner);
    if (m.month_id) monthIds.add(m.month_id);
    if (m.pod_id) podIds.add(m.pod_id);
  }

  // 2) Fetch players
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, full_name, username, rating")
    .in("id", Array.from(playerIds));

  if (pErr) {
    errEl.textContent = "Error loading players.";
    errEl.classList.remove("hidden");
    return;
  }

  const playersMap = {};
  for (const p of players) playersMap[p.id] = p;

  // 3) Fetch months
  let monthsMap = {};
  if (monthIds.size > 0) {
    const { data: months, error: moErr } = await supabase
      .from("league_months")
      .select("id, name")
      .in("id", Array.from(monthIds));

    if (!moErr && months) {
      monthsMap = {};
      for (const m of months) monthsMap[m.id] = m;
    }
  }

  // 4) Fetch pods
  let podsMap = {};
  if (podIds.size > 0) {
    const { data: pods, error: poErr } = await supabase
      .from("pods")
      .select("id, name")
      .in("id", Array.from(podIds));

    if (!poErr && pods) {
      podsMap = {};
      for (const p of pods) podsMap[p.id] = p;
    }
  }

  // Render
  container.innerHTML = "";
  for (const match of matches) {
    const a = playersMap[match.player_a];
    const b = playersMap[match.player_b];
    if (!a || !b) continue;

    const winner =
      match.winner === match.player_a ? "A" :
      match.winner === match.player_b ? "B" : "?";

    const monthName =
      (match.month_id && monthsMap[match.month_id]?.name) || "Unknown month";
    const podName =
      (match.pod_id && podsMap[match.pod_id]?.name) || "No pod";

    const row = document.createElement("div");
    row.className = "bg-white p-4 rounded-lg shadow flex flex-col gap-2";

    row.innerHTML = `
      <div class="flex justify-between items-center">
        <div class="text-sm">
          <div class="font-semibold">${a.full_name} vs ${b.full_name}</div>
          <div class="text-xs text-slate-600">
            Month: ${monthName} · Pod: ${podName}
          </div>
          <div class="text-xs text-slate-600 mt-1">
            Winner: ${
              winner === "A"
                ? a.full_name
                : winner === "B"
                ? b.full_name
                : "Unknown"
            }
          </div>
          <div class="text-xs text-slate-600">
            Current ratings: ${a.rating} (${a.username || "no user"}) vs
            ${b.rating} (${b.username || "no user"})
          </div>
          ${
            match.notes
              ? `<div class="text-xs text-slate-500 mt-1">Notes: ${match.notes}</div>`
              : ""
          }
        </div>
        <div class="flex flex-col gap-2 items-end">
          <button class="approve-btn bg-emerald-600 text-white text-xs px-3 py-1 rounded">
            Approve
          </button>
          <button class="skip-btn bg-slate-200 text-slate-800 text-xs px-3 py-1 rounded">
            Skip
          </button>
        </div>
      </div>
    `;

    const approveBtn = row.querySelector(".approve-btn");
    const skipBtn = row.querySelector(".skip-btn");

    approveBtn.addEventListener("click", async () => {
      approveBtn.disabled = true;
      approveBtn.textContent = "Approving…";
      const ok = await approveMatch(match, playersMap);
      if (!ok) {
        approveBtn.disabled = false;
        approveBtn.textContent = "Approve";
        return;
      }
      row.remove();
      if (container.children.length === 0) {
        container.innerHTML =
          "<p class='text-sm text-slate-600'>No pending matches.</p>";
      }
    });

    skipBtn.addEventListener("click", () => {
      row.remove();
      if (container.children.length === 0) {
        container.innerHTML =
          "<p class='text-sm text-slate-600'>No pending matches.</p>";
      }
    });

    container.appendChild(row);
  }
}

// Approve match: update ratings + rating_history + mark approved
async function approveMatch(match, playersMap) {
  errEl.classList.add("hidden");

  const a = playersMap[match.player_a];
  const b = playersMap[match.player_b];
  if (!a || !b) {
    errEl.textContent = "Player records missing for match.";
    errEl.classList.remove("hidden");
    return false;
  }

  const winner =
    match.winner === match.player_a ? "A" :
    match.winner === match.player_b ? "B" : null;

  if (!winner) {
    errEl.textContent = "Match has no valid winner set.";
    errEl.classList.remove("hidden");
    return false;
  }

  const kFactor = match.k_factor || 24;
  const { newA, newB, deltaA, deltaB } = computeElo(
    a.rating,
    b.rating,
    winner,
    kFactor
  );

  // 1) Insert rating_history for both players
  const { error: histErr } = await supabase.from("rating_history").insert([
    {
      player_id: a.id,
      match_id: match.id,
      old_rating: a.rating,
      new_rating: newA,
      delta: deltaA,
    },
    {
      player_id: b.id,
      match_id: match.id,
      old_rating: b.rating,
      new_rating: newB,
      delta: deltaB,
    },
  ]);

  if (histErr) {
    console.error(histErr);
    errEl.textContent = "Error writing rating history.";
    errEl.classList.remove("hidden");
    return false;
  }

  // 2) Update players table with new ratings
  const { error: upAErr } = await supabase
    .from("players")
    .update({ rating: newA })
    .eq("id", a.id);
  const { error: upBErr } = await supabase
    .from("players")
    .update({ rating: newB })
    .eq("id", b.id);

  if (upAErr || upBErr) {
    console.error(upAErr || upBErr);
    errEl.textContent = "Error updating player ratings.";
    errEl.classList.remove("hidden");
    return false;
  }

  // 3) Mark match approved
  const { error: appErr } = await supabase
    .from("league_matches")
    .update({ approved: true })
    .eq("id", match.id);

  if (appErr) {
    console.error(appErr);
    errEl.textContent = "Error marking match approved.";
    errEl.classList.remove("hidden");
    return false;
  }

  // Update cached ratings in map so approving multiple matches uses updated values
  a.rating = newA;
  b.rating = newB;

  return true;
}

loadPending();