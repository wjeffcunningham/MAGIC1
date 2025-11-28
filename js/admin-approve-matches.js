import { supabase } from "./supabase.js";
import { getLocalSession } from "./session.js";

const list = document.getElementById("match-list");
const notAdmin = document.getElementById("not-admin");

// ------------------------------
// ELO CALCULATION
// ------------------------------
function calculateElo(oldA, oldB, winner, k) {
  const Qa = Math.pow(10, oldA / 400);
  const Qb = Math.pow(10, oldB / 400);

  const Ea = Qa / (Qa + Qb);
  const Eb = Qb / (Qa + Qb);

  const Sa = winner === "A" ? 1 : 0;
  const Sb = winner === "B" ? 1 : 0;

  const newA = Math.round(oldA + k * (Sa - Ea));
  const newB = Math.round(oldB + k * (Sb - Eb));

  return { newA, newB, deltaA: newA - oldA, deltaB: newB - oldB };
}

// ------------------------------
// LOAD + ADMIN CHECK
// ------------------------------
async function main() {
  const session = getLocalSession();
  if (!session?.isAdmin) {
    notAdmin.classList.remove("hidden");
    return;
  }

  loadMatches();
}

// ------------------------------
// LOAD UNAPPROVED MATCHES
// ------------------------------
async function loadMatches() {
  const { data, error } = await supabase
    .from("league_matches")
    .select(`
      id,
      pod_id,
      month_id,
      player_a,
      player_b,
      winner,
      k_factor,
      notes,
      played_at,
      players!league_matches_player_a_fkey (
        id,
        full_name,
        rating
      ),
      players_b:players!league_matches_player_b_fkey (
        id,
        full_name,
        rating
      )
    `)
    .eq("approved", false)
    .order("played_at", { ascending: true });

  if (error) {
    list.innerHTML = `<p class="text-red-600">Error loading matches.</p>`;
    list.classList.remove("hidden");
    return;
  }

  if (!data.length) {
    list.innerHTML = `<p class="text-center text-slate-600">No pending matches.</p>`;
    list.classList.remove("hidden");
    return;
  }

  list.innerHTML = "";
  list.classList.remove("hidden");

  data.forEach(match => renderMatch(match));
}

// ------------------------------
// CARD RENDERER
// ------------------------------
function renderMatch(m) {
  const card = document.createElement("div");
  card.className = "bg-white rounded-xl shadow p-6";

  const A = m.players;
  const B = m.players_b;

  card.innerHTML = `
    <p class="text-lg font-semibold mb-1">
      ${A.full_name}
      <span class="text-slate-500">(R ${A.rating})</span>
       vs
      ${B.full_name}
      <span class="text-slate-500">(R ${B.rating})</span>
    </p>

    <p class="text-sm text-slate-600 mb-2">
      Winner: <strong>${m.winner === A.id ? A.full_name : B.full_name}</strong>
    </p>

    ${m.notes ? `<p class="text-sm italic mb-3 text-slate-500">${m.notes}</p>` : ""}

    <div class="flex gap-3 mt-3">
      <button
        class="approve bg-green-600 text-white px-4 py-2 rounded"
        data-id="${m.id}"
        data-a="${A.id}"
        data-b="${B.id}"
        data-ra="${A.rating}"
        data-rb="${B.rating}"
        data-w="${m.winner}"
        data-k="${m.k_factor}"
      >
        Approve
      </button>

      <button
        class="deny bg-red-600 text-white px-4 py-2 rounded"
        data-id="${m.id}"
      >
        Deny
      </button>
    </div>
  `;

  list.appendChild(card);

  card.querySelector(".approve").addEventListener("click", approveMatch);
  card.querySelector(".deny").addEventListener("click", denyMatch);
}

// ------------------------------
// APPROVE MATCH
// ------------------------------
async function approveMatch(e) {
  const id = e.target.dataset.id;

  const A = e.target.dataset.a;
  const B = e.target.dataset.b;
  const RA = parseInt(e.target.dataset.ra);
  const RB = parseInt(e.target.dataset.rb);
  const winnerId = e.target.dataset.w;
  const K = parseInt(e.target.dataset.k);

  const winner = winnerId === A ? "A" : "B";

  // ELO update
  const { newA, newB, deltaA, deltaB } = calculateElo(RA, RB, winner, K);

  // Update players
  await supabase.from("players").update({ rating: newA }).eq("id", A);
  await supabase.from("players").update({ rating: newB }).eq("id", B);

  // Write rating history
  await supabase.from("rating_history").insert([
    {
      player_id: A,
      match_id: id,
      old_rating: RA,
      new_rating: newA,
      delta: deltaA
    },
    {
      player_id: B,
      match_id: id,
      old_rating: RB,
      new_rating: newB,
      delta: deltaB
    }
  ]);

  // Mark match as approved
  await supabase
    .from("league_matches")
    .update({ approved: true })
    .eq("id", id);

  loadMatches();
}

// ------------------------------
// DENY MATCH
// ------------------------------
async function denyMatch(e) {
  const id = e.target.dataset.id;

  await supabase
    .from("league_matches")
    .delete()
    .eq("id", id);

  loadMatches();
}

main();