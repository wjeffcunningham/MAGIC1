import { supabase } from "./supabase.js";
import { requireSession } from "./session.js";

requireSession();

const form = document.getElementById("player-search-form");
const input = document.getElementById("player-query");
const results = document.getElementById("player-results");
const errEl = document.getElementById("player-error");

async function searchPlayers(q) {
  errEl.classList.add("hidden");
  results.innerHTML = "Loading…";

  let query = supabase
    .from("players")
    .select("id, full_name, username, rating, remote_preference, play_style")
    .order("full_name");

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(
      `full_name.ilike.${term},username.ilike.${term}`
    );
  }

  const { data, error } = await query;

  if (error) {
    errEl.textContent = "Error searching players.";
    errEl.classList.remove("hidden");
    results.innerHTML = "";
    return;
  }

  if (!data || data.length === 0) {
    results.innerHTML = "<p class='text-slate-600'>No players found.</p>";
    return;
  }

  results.innerHTML = "";
  for (const p of data) {
    const card = document.createElement("div");
    card.className = "bg-white rounded-xl shadow p-4";

    card.innerHTML = `
      <div class="font-semibold">${p.full_name} ${
      p.username ? `<span class="text-xs text-slate-500">(${p.username})</span>` : ""
    }</div>
      <div class="text-xs text-slate-600 mt-1">
        Rating: ${p.rating}
        · Remote: ${p.remote_preference}
        · Style: ${p.play_style}
      </div>
    `;

    results.appendChild(card);
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  searchPlayers(input.value);
});

// initial load: all players
searchPlayers("");