import { supabase } from "./supabase.js";

const container = document.getElementById("pending-container");
const errorEl = document.getElementById("pending-error");

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

async function loadPending() {
  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, email, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    showError("Error loading pending players.");
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML =
      '<p class="text-sm text-slate-600">No pending players.</p>';
    return;
  }

  container.innerHTML = data
    .map(
      (p) => `
      <div class="bg-white border rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <div class="font-semibold text-sm">${p.full_name}</div>
          <div class="text-xs text-slate-600">${p.email}</div>
          <div class="text-[11px] text-slate-400 mt-1">status: ${p.status}</div>
        </div>
        <div class="space-x-2">
          <button
            data-id="${p.id}"
            data-action="approve"
            class="text-xs bg-emerald-600 text-white px-3 py-1 rounded">
            Approve
          </button>
          <button
            data-id="${p.id}"
            data-action="block"
            class="text-xs bg-red-600 text-white px-3 py-1 rounded">
            Block
          </button>
        </div>
      </div>
    `
    )
    .join("");

  container.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const id = btn.getAttribute("data-id");
    const action = btn.getAttribute("data-action");

    if (action === "approve") {
      await updateStatus(id, "active");
    } else if (action === "block") {
      if (!confirm("Block this player account?")) return;
      await updateStatus(id, "blocked");
    }
  });
}

async function updateStatus(playerId, status) {
  const { error } = await supabase
    .from("players")
    .update({ status })
    .eq("id", playerId);

  if (error) {
    console.error(error);
    showError("Error updating player status.");
    return;
  }

  // Reload list
  await loadPending();
}

loadPending();