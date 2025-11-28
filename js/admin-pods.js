import { supabase } from "./supabase.js";
import { getLocalSession } from "./session.js";

const ui = document.getElementById("ui");
const notAdmin = document.getElementById("not-admin");

const monthBlock = document.getElementById("month-block");
const signupList = document.getElementById("signup-list");
const existingPodsDiv = document.getElementById("existing-pods");
const previewBlock = document.getElementById("preview-block");
const pairingsPreviewDiv = document.getElementById("pairings-preview");

let activeMonth = null;
let signups = [];
let existingPods = [];

// ------------------------------
// HELPER: shuffle array
// ------------------------------
function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// ------------------------------
// LOAD ADMIN + MONTH + SIGNUPS
// ------------------------------
async function init() {
  const sess = getLocalSession();
  if (!sess?.isAdmin) {
    notAdmin.classList.remove("hidden");
    return;
  }

  ui.classList.remove("hidden");

  await loadActiveMonth();
  await loadSignups();
  await loadExistingPods();
}

// ------------------------------
// GET ACTIVE MONTH
// ------------------------------
async function loadActiveMonth() {
  const { data, error } = await supabase
    .from("league_months")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    monthBlock.innerHTML = `<p class="text-red-600">No active month found.</p>`;
    return;
  }

  activeMonth = data;

  monthBlock.innerHTML = `
    <p class="text-lg">
      <strong>Season:</strong> ${data.season_id}<br>
      <strong>Month:</strong> ${data.month_name} (${data.start_date} → ${data.end_date})
    </p>
  `;
}

// ------------------------------
// LOAD SIGNUPS
// ------------------------------
async function loadSignups() {
  const { data } = await supabase
    .from("league_signups")
    .select("*, players(*)")
    .eq("month_id", activeMonth.id);

  signups = data || [];

  if (!signups.length) {
    signupList.innerHTML = `<p class="text-slate-600">No signups yet.</p>`;
  } else {
    signupList.innerHTML = signups
      .map(s => `<div class="border-b py-1">${s.players.full_name}</div>`)
      .join("");
  }
}

// ------------------------------
// LOAD EXISTING PODS
// ------------------------------
async function loadExistingPods() {
  const { data } = await supabase
    .from("league_pods")
    .select("*, members:league_pod_members(*)")
    .eq("month_id", activeMonth.id);

  existingPods = data || [];

  if (!existingPods.length) {
    existingPodsDiv.innerHTML = `<p class="text-slate-600">None yet.</p>`;
  } else {
    existingPodsDiv.innerHTML = existingPods
      .map(p => {
        const mem = p.members.map(m => m.player_id).join(", ");
        return `<div class="border p-2 rounded mb-2">
          <strong>${p.pod_name}</strong><br>
          Members: ${mem}
        </div>`;
      })
      .join("");
  }
}

// ------------------------------
// POD ALGORITHM
// ------------------------------
function generatePods() {
  const players = shuffle(signups.map(s => s.player_id));
  const podNames = ["Emerald", "Sapphire", "Ruby", "Pearl"];
  const pods = [[], [], [], []];

  let idx = 0;
  players.forEach(id => {
    pods[idx].push(id);
    idx = (idx + 1) % 4;
  });

  return podNames.map((name, i) => ({
    pod_name: name,
    members: pods[i]
  }));
}

// ------------------------------
// LISTENERS
// ------------------------------
document.getElementById("btn-preview").addEventListener("click", () => {
  const pods = generatePods();
  previewBlock.classList.remove("hidden");

  previewBlock.innerHTML = `
    <h3 class="text-xl font-bold mb-3">Test Pod Preview</h3>
    <div class="bg-white p-4 rounded shadow">
      ${pods
        .map(
          p => `
        <div class="mb-4">
          <strong>${p.pod_name}</strong><br>
          ${p.members.join(", ")}
        </div>
      `
        )
        .join("")}
    </div>
  `;
});

document.getElementById("btn-generate").addEventListener("click", async () => {
  const pods = generatePods();

  // delete existing pods + members
  await supabase
    .from("league_pods")
    .delete()
    .eq("month_id", activeMonth.id);

  // insert pods
  for (const pod of pods) {
    const { data: inserted } = await supabase
      .from("league_pods")
      .insert({
        month_id: activeMonth.id,
        pod_name: pod.pod_name
      })
      .select()
      .single();

    // insert members
    for (const pid of pod.members) {
      await supabase.from("league_pod_members").insert({
        pod_id: inserted.id,
        player_id: pid
      });
    }
  }

  alert("Pods generated!");
  await loadExistingPods();
});

// ------------------------------
// GENERATE ROUND-ROBIN PAIRINGS
// ------------------------------
function roundRobin(players) {
  const pairings = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      pairings.push([players[i], players[j]]);
    }
  }
  return pairings;
}

document.getElementById("btn-pairings-preview").addEventListener("click", async () => {
  const { data: pods } = await supabase
    .from("league_pods")
    .select("id, pod_name, members:league_pod_members(player_id)")
    .eq("month_id", activeMonth.id);

  if (!pods?.length) {
    alert("No pods exist. Generate them first.");
    return;
  }

  pairingsPreviewDiv.classList.remove("hidden");

  pairingsPreviewDiv.innerHTML = `
    <h3 class="text-xl font-bold mb-3">Pairings Preview</h3>
    ${pods
      .map(p => {
        const ids = p.members.map(m => m.player_id);
        const prs = roundRobin(ids);
        return `
        <div class="mb-6 bg-white p-4 rounded shadow">
          <strong>${p.pod_name}</strong><br>
          ${prs.map(pr => `${pr[0]} vs ${pr[1]}`).join("<br>")}
        </div>`;
      })
      .join("")}
  `;
});

document.getElementById("btn-pairings-commit").addEventListener("click", async () => {
  const { data: pods } = await supabase
    .from("league_pods")
    .select("id, pod_name, members:league_pod_members(player_id)")
    .eq("month_id", activeMonth.id);

  for (const p of pods) {
    const ids = p.members.map(m => m.player_id);
    const prs = roundRobin(ids);

    for (const pr of prs) {
      await supabase.from("league_matches").insert({
        month_id: activeMonth.id,
        pod_id: p.id,
        player_a: pr[0],
        player_b: pr[1],
        winner: null,
        approved: false,
        k_factor: activeMonth.k_factor
      });
    }
  }

  alert("Pairings committed.");
});

init();