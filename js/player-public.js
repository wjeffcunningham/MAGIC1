import { supabase } from "./supabase.js";

const nameEl = document.getElementById("player-name");
const ratingEl = document.getElementById("player-rating");
const matchesEl = document.getElementById("player-matches");
const errorEl = document.getElementById("player-error");

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function loadPlayer(playerId) {
  const { data, error } = await supabase
    .from("players")
    .select("full_name, rating, status")
    .eq("id", playerId)
    .single();

  if (error || !data) throw new Error("Player not found");

  nameEl.textContent = data.full_name;
  ratingEl.textContent = `Rating: ${data.rating} · Status: ${data.status}`;
}

async function loadMatches(playerId) {
  const { data, error } = await supabase
    .from("league_matches")
    .select(`
      id,
      player_a,
      player_b,
      winner,
      played_at,
      approved,
      notes,
      players:player_a(full_name),
      players_b:player_b(full_name)
    `)
    .or(`player_a.eq.${playerId},player_b.eq.${playerId}`)
    .order("played_at", { ascending: false });

  if (error) throw new Error("Error loading matches");

  if (!data || data.length === 0) {
    matchesEl.innerHTML =
      '<p class="text-slate-600 text-sm">No matches recorded.</p>';
    return;
  }

  matchesEl.innerHTML = data
    .map((m) => {
      const youAreA = m.player_a === playerId;
      const opponentName = youAreA
        ? m.players_b.full_name
        : m.players.full_name;

      const result =
        m.winner === playerId
          ? '<span class="text-emerald-700 font-semibold">Win</span>'
          : '<span class="text-red-600 font-semibold">Loss</span>';

      const status = m.approved
        ? '<span class="text-emerald-600 text-xs ml-2">(Approved)</span>'
        : '<span class="text-orange-600 text-xs ml-2">(Pending)</span>';

      return `
        <div class="bg-white border rounded p-3 shadow-sm">
          <div class="flex justify-between">
            <div class="font-medium">vs ${opponentName}</div>
            <div>${result} ${status}</div>
          </div>
          <div class="text-xs text-slate-600 mt-1">
            Played: ${new Date(m.played_at).toLocaleString()}
          </div>
          ${
            m.notes
              ? `<div class="text-xs text-slate-700 mt-1 italic">Notes: ${m.notes}</div>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

async function init() {
  const playerId = getQueryParam("id");
  if (!playerId) {
    errorEl.textContent = "Missing player id.";
    errorEl.classList.remove("hidden");
    return;
  }

  try {
    await loadPlayer(playerId);
    await loadMatches(playerId);
  } catch (e) {
    console.error(e);
    errorEl.textContent = e.message || "Error loading player.";
    errorEl.classList.remove("hidden");
  }
}

init();