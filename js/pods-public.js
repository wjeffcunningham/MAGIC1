import { supabase } from "/js/supabase.js";

const monthSelect = document.getElementById("month-select");
const podsContainer = document.getElementById("pods-container");
const errorEl = document.getElementById("pods-error");

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function clearError() {
  errorEl.classList.add("hidden");
}

async function loadMonths() {
  const { data, error } = await supabase
    .from("league_months")
    .select("id, name, start_date")
    .order("start_date");

  if (error) return showError("Error loading months");

  monthSelect.innerHTML = data
    .map((m) => `<option value="${m.id}">${m.name}</option>`)
    .join("");

  if (data.length) {
    await loadPods(data[0].id);
  }
}

async function loadPods(monthId) {
  clearError();
  podsContainer.innerHTML = "<p>Loading pods…</p>";

  const { data: pods, error: podErr } = await supabase
    .from("pods")
    .select("id, name")
    .eq("month_id", monthId)
    .order("name");

  if (podErr) return showError("Error loading pods");

  const podIds = pods.map((p) => p.id);

  const { data: members, error: memErr } = await supabase
    .from("pod_members")
    .select(`
      pod_id,
      players:player_id (
        full_name,
        username,
        league_rating
      )
    `)
    .in("pod_id", podIds)
    .order("players.full_name");

  if (memErr) return showError("Error loading pod members");

  // Build map
  const podMap = {};
  for (const p of pods) podMap[p.id] = [];

  for (const m of members) podMap[m.pod_id].push(m.players);

  // Render
  podsContainer.innerHTML = pods
    .map((pod) => renderPod(pod.name, podMap[pod.id]))
    .join("");
}

function renderPod(name, players) {
  return `
    <div class="bg-white border rounded-xl shadow p-4">
      <h2 class="text-lg font-semibold mb-2">${name}</h2>
      ${
        players.length
          ? `<ul class="space-y-1 text-sm">
               ${players
                 .map(
                   (p) => `
                 <li>
                   ${p.full_name}
                   ${
                     p.username
                       ? `<span class="text-xs text-slate-500">(${p.username})</span>`
                       : ""
                   }
                   <span class="text-xs text-slate-400"> — L:${p.league_rating}</span>
                 </li>`
                 )
                 .join("")}
             </ul>`
          : `<p class="text-slate-500 text-sm">No members yet.</p>`
      }
    </div>
  `;
}

monthSelect.addEventListener("change", () => {
  loadPods(monthSelect.value);
});

loadMonths();