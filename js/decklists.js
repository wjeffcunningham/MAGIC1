import { supabase } from "./supabase.js";
import { requireSession } from "./session.js";

const session = requireSession();

const form = document.getElementById("deck-form");
const eventSelect = document.getElementById("deck-event");
const errEl = document.getElementById("deck-error");
const okEl = document.getElementById("deck-success");
const listEl = document.getElementById("decklist-list");

async function init() {
  // Load events for dropdown
  const { data: events, error: eErr } = await supabase
    .from("events")
    .select("id, name, event_date")
    .order("event_date");

  if (!eErr && events) {
    for (const ev of events) {
      const opt = document.createElement("option");
      opt.value = ev.id;
      opt.textContent = `${ev.name} (${ev.event_date})`;
      eventSelect.appendChild(opt);
    }
  }

  loadMyDecklists();
}

async function loadMyDecklists() {
  const { data, error } = await supabase
    .from("decklists")
    .select("id, title, archetype, list_url, created_at, events(name)")
    .eq("player_id", session.playerId)
    .order("created_at", { ascending: false });

  if (error) {
    listEl.textContent = "Error loading decklists.";
    return;
  }

  if (!data || data.length === 0) {
    listEl.textContent = "No decklists submitted yet.";
    return;
  }

  listEl.innerHTML = "";
  for (const d of data) {
    const card = document.createElement("div");
    card.className = "border rounded-lg p-3";

    card.innerHTML = `
      <div class="font-semibold">${d.title}</div>
      <div class="text-xs text-slate-600 mb-1">
        ${d.archetype || ""} ${
      d.events?.name ? `· Event: ${d.events.name}` : ""
    }
      </div>
      <div class="text-xs text-slate-500 mb-1">
        Submitted: ${new Date(d.created_at).toLocaleString()}
      </div>
      ${
        d.list_url
          ? `<a href="${d.list_url}" target="_blank"
                class="text-xs text-sky-700 underline">Open list URL</a>`
          : ""
      }
    `;

    listEl.appendChild(card);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errEl.classList.add("hidden");
  okEl.classList.add("hidden");

  const fd = new FormData(form);
  const title = fd.get("title").toString().trim();
  const archetype = fd.get("archetype").toString().trim() || null;
  const list_url = fd.get("list_url").toString().trim() || null;
  const mainboard = fd.get("mainboard").toString().trim() || null;
  const sideboard = fd.get("sideboard").toString().trim() || null;
  const event_id = fd.get("event_id") || null;

  const { error } = await supabase.from("decklists").insert({
    player_id: session.playerId,
    event_id: event_id || null,
    title,
    archetype,
    mainboard,
    sideboard,
    list_url,
  });

  if (error) {
    errEl.textContent = "Error submitting decklist.";
    errEl.classList.remove("hidden");
    return;
  }

  okEl.textContent = "Decklist submitted.";
  okEl.classList.remove("hidden");
  form.reset();
  loadMyDecklists();
});

init();