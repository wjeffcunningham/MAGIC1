import { supabase, getLocalSession, isAdmin } from "./session.js";

const adminContent = document.getElementById("admin-content");
const notAdmin = document.getElementById("not-admin");
const pendingList = document.getElementById("pending-list");
const searchInput = document.getElementById("search-input");
const noResults = document.getElementById("no-results");

let pendingPlayers = [];

main();

async function main() {
  const session = getLocalSession();
  if (!session) {
    notAdmin.classList.remove("hidden");
    return;
  }

  const admin = await isAdmin();
  if (!admin) {
    notAdmin.classList.remove("hidden");
    return;
  }

  adminContent.classList.remove("hidden");

  await loadPendingPlayers();
  setupSearch();
}

async function loadPendingPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  pendingPlayers = data || [];
  renderList(pendingPlayers);
}

function setupSearch() {
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();

    const filtered = pendingPlayers.filter(p =>
      (p.full_name || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q)
    );

    renderList(filtered);
  });
}

function renderList(list) {
  pendingList.innerHTML = "";

  if (!list.length) {
    noResults.classList.remove("hidden");
    return;
  }

  noResults.classList.add("hidden");

  list.forEach(p => {
    const row = document.createElement("div");
    row.className =
      "bg-white p-4 rounded-xl shadow flex flex-col md:flex-row md:items-center md:justify-between gap-3";

    row.innerHTML = `
      <div>
        <p class="font-semibold">${p.full_name}</p>
        <p class="text-sm text-slate-600">${p.email}</p>
      </div>

      <div class="flex gap-2">
        <button class="approve-btn bg-green-600 text-white px-3 py-1 rounded text-sm font-medium"
                data-id="${p.id}">
          Approve
        </button>

        <button class="deny-btn bg-red-600 text-white px-3 py-1 rounded text-sm font-medium"
                data-id="${p.id}">
          Deny
        </button>
      </div>
    `;

    pendingList.appendChild(row);
  });

  bindButtons();
}

function bindButtons() {
  document.querySelectorAll(".approve-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.getAttribute("data-id");
      await approvePlayer(id);
    });
  });

  document.querySelectorAll(".deny-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.getAttribute("data-id");
      await denyPlayer(id);
    });
  });
}

async function approvePlayer(id) {
  // Activate the account
  await supabase
    .from("players")
    .update({ status: "active" })
    .eq("id", id);

  // Remove from local list
  pendingPlayers = pendingPlayers.filter(p => p.id !== id);
  renderList(pendingPlayers);
}

async function denyPlayer(id) {
  // Hard delete — safer than setting "dropped"
  await supabase
    .from("players")
    .delete()
    .eq("id", id);

  pendingPlayers = pendingPlayers.filter(p => p.id !== id);
  renderList(pendingPlayers);
}