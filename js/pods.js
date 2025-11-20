import { supabase } from "./supabase.js";

// Extract ?month_id=xyz from the URL
function getMonthId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("month_id");
}

async function loadPods() {
  const monthId = getMonthId();
  if (!monthId) {
    document.getElementById("pods-container").innerHTML =
      "<p>Error: month_id missing in URL.</p>";
    return;
  }

  // Load month info
  const { data: monthData, error: monthErr } = await supabase
    .from("league_months")
    .select("*")
    .eq("id", monthId)
    .single();

  if (monthErr || !monthData) {
    document.getElementById("pods-container").innerHTML =
      "<p>Error loading month.</p>";
    return;
  }

  document.getElementById("month-title").textContent = monthData.name;

  // Load pods for this month
  const { data: pods, error: podsErr } = await supabase
    .from("pods")
    .select("*")
    .eq("month_id", monthId)
    .order("name");

  if (podsErr) {
    document.getElementById("pods-container").innerHTML =
      "<p>Error loading pods.</p>";
    return;
  }

  if (!pods || pods.length === 0) {
    document.getElementById("pods-container").innerHTML =
      "<p>No pods have been assigned yet for this month.</p>";
    return;
  }

  // Load all pod members + player info
  const podIds = pods.map(p => p.id);

  const { data: members, error: memErr } = await supabase
    .from("pod_members")
    .select(`
      pod_id,
      players (
        id,
        full_name,
        rating,
        play_style,
        remote_preference
      )
    `)
    .in("pod_id", podIds)
    .order("players(full_name)");

  if (memErr) {
    document.getElementById("pods-container").innerHTML =
      "<p>Error loading pod members.</p>";
    return;
  }

  // Group players by pod_id
  const grouped = {};
  for (const pod of pods) {
    grouped[pod.id] = [];
  }

  for (const m of members) {
    grouped[m.pod_id].push(m.players);
  }

  // Render HTML
  let html = "";

  for (const pod of pods) {
    html += `
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-xl font-semibold mb-4">${pod.name}</h3>
        <ul class="space-y-2">
    `;

    const players = grouped[pod.id];
    if (!players || players.length === 0) {
      html += `<li class="text-slate-500">No players assigned.</li>`;
    } else {
      for (const pl of players) {
        html += `
          <li class="border-b pb-2">
            <strong>${pl.full_name}</strong><br/>
            Rating: ${pl.rating} · ${pl.play_style} · ${pl.remote_preference}
          </li>
        `;
      }
    }

    html += `
        </ul>
      </div>
    `;
  }

  document.getElementById("pods-container").innerHTML = html;
}

loadPods();