// /js/bcwl-widget.js
// One-shot league standings + schedule widget

import { supabase } from "./config.js";
import { CURRENT_SEASON, getProfile } from "./db.js";

const root = document.getElementById("league-widget");

function render(html) {
  if (root) root.innerHTML = html;
}

// ELO-like rating update
function updateRating(rA, rB, winner, K = 24) {
  const EA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const EB = 1 - EA;

  let SA = winner === "A" ? 1 : 0;
  let SB = 1 - SA;

  return [
    Math.round(rA + K * (SA - EA)),
    Math.round(rB + K * (SB - EB))
  ];
}

async function loadData() {
  const { data: players } = await supabase
    .from("players")
    .select("id, full_name, email, rating")
    .order("rating", { ascending: false });

  const { data: results } = await supabase
    .from("results")
    .select("*")
    .eq("league", CURRENT_SEASON);

  const { data: pairings } = await supabase
    .from("pairings")
    .select("*")
    .eq("league", CURRENT_SEASON)
    .order("round", { ascending: true });

  return { players, results, pairings };
}

async function init() {
  const profile = await getProfile();
  const isMod = profile && profile.is_mod;

  const { players, results, pairings } = await loadData();

  // Standings Table
  let standingsHTML = `
    <h3>Standings</h3>
    <table style="width:100%; border-collapse:collapse;">
      <tr>
        <th style="text-align:left;">Player</th>
        <th>Rating</th>
      </tr>
  `;

  players.forEach(p => {
    standingsHTML += `
      <tr>
        <td>${p.full_name}</td>
        <td style="text-align:center;">${p.rating}</td>
      </tr>
    `;
  });

  standingsHTML += `</table>`;

  // Results Table
  let resultsHTML = `
    <h3 style="margin-top:20px;">Results</h3>
  `;

  if (!results || results.length === 0) {
    resultsHTML += `<p>No results yet.</p>`;
  } else {
    results.forEach(r => {
      resultsHTML += `<div>Round ${r.round}: <strong>${r.winner}</strong> won</div>`;
    });
  }

  // Pairings Schedule
  let pairingsHTML = `
    <h3 style="margin-top:20px;">Schedule (Pairings)</h3>
  `;

  if (!pairings || pairings.length === 0) {
    pairingsHTML += `<p>No rounds posted yet.</p>`;
  } else {
    pairings.forEach(p => {
      pairingsHTML += `<div><strong>Round ${p.round}:</strong> ${JSON.stringify(p.data)}</div>`;
    });
  }

  // Admin Controls (optional)
  let adminHTML = "";
  if (isMod) {
    adminHTML = `
      <div style="margin-top:24px; padding:12px; border:1px solid #ccc;">
        <h4>Admin: Record Match Result</h4>
        <p>(UI pending – we can flesh this out later)</p>
      </div>
    `;
  }

  render(`
    ${standingsHTML}
    ${resultsHTML}
    ${pairingsHTML}
    ${adminHTML}
  `);
}

document.addEventListener("DOMContentLoaded", init);