import { supabase } from "./supabase.js";
import { getLocalSession } from "./session.js";

const list = document.getElementById("signup-list");
const notAdmin = document.getElementById("not-admin");

async function main() {
  const session = getLocalSession();
  if (!session?.isAdmin) {
    notAdmin.classList.remove("hidden");
    return;
  }

  loadSignups();
}

async function loadSignups() {
  // Get current active season
  const { data: seasons } = await supabase
    .from("league_seasons")
    .select("*")
    .eq("active", true)
    .single();

  if (!seasons) {
    list.innerHTML = `<p class="text-center text-slate-600">No active season.</p>`;
    list.classList.remove("hidden");
    return;
  }

  const { id: seasonId } = seasons;

  const { data, error } = await supabase
    .from("league_signups")
    .select("id, status, player_id, players(full_name, email)")
    .eq("season_id", seasonId)
    .eq("status", "pending");

  if (error) {
    list.innerHTML = `<p class="text-red-600">Error loading signups.</p>`;
    return;
  }

  if (!data.length) {
    list.innerHTML = `<p class="text-center text-slate-600">No pending signups.</p>`;
    list.classList.remove("hidden");
    return;
  }

  list.innerHTML = "";
  list.classList.remove("hidden");

  data.forEach(row => {
    const player = row.players;

    const card = document.createElement("div");
    card.className = "bg-white p-5 rounded-xl shadow";

    card.innerHTML = `
      <p class="text-lg font-semibold">${player.full_name}</p>
      <p class="text-slate-600 text-sm mb-2">${player.email}</p>

      <div class="flex gap-3 mt-3">
        <button class="approve bg-green-600 text-white px-4 py-2 rounded"
                data-id="${row.id}">
          Approve
        </button>
        <button class="deny bg-red-600 text-white px-4 py-2 rounded"
                data-id="${row.id}">
          Reject
        </button>
      </div>
    `;

    list.appendChild(card);
  });

  // attach actions
  document.querySelectorAll(".approve").forEach(btn =>
    btn.addEventListener("click", approveSignup)
  );

  document.querySelectorAll(".deny").forEach(btn =>
    btn.addEventListener("click", rejectSignup)
  );
}

async function approveSignup(e) {
  const id = e.target.dataset.id;

  await supabase
    .from("league_signups")
    .update({ status: "approved" })
    .eq("id", id);

  loadSignups();
}

async function rejectSignup(e) {
  const id = e.target.dataset.id;

  await supabase
    .from("league_signups")
    .update({ status: "rejected" })
    .eq("id", id);

  loadSignups();
}

main();