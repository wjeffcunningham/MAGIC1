import { supabase } from "./supabase.js";

const container = document.getElementById("pending-container");
const errorBox = document.getElementById("pending-error");

async function loadPending() {
  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, email, status")
    .eq("status", "pending")
    .order("full_name");

  if (error) {
    errorBox.textContent = "Error loading pending players.";
    errorBox.classList.remove("hidden");
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<p class="text-slate-600">No pending players.</p>`;
    return;
  }

  container.innerHTML = data
    .map(
      (p) => `
      <div class="bg-white p-4 border rounded shadow">
        <div class="font-semibold">${p.full_name}</div>
        <div class="text-sm text-slate-600">${p.email}</div>
        <button
          class="mt-3 bg-emerald-600 text-white px-3 py-1 rounded"
          onclick="approvePlayer('${p.id}')">
          Approve
        </button>
      </div>
    `
    )
    .join("");
}

window.approvePlayer = async function (playerId) {
  const { error } = await supabase
    .from("players")
    .update({ status: "active" })
    .eq("id", playerId);

  if (error) {
    alert("Error approving player.");
    return;
  }

  loadPending();
};

loadPending();