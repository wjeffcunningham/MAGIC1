import { supabase } from "./session.js";

const loading = document.getElementById("loading");
const table = document.getElementById("standings-table");
const body = document.getElementById("standings-body");

main();

async function main() {
  const { data: season } = await supabase
    .from("league_seasons")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (!season) {
    loading.textContent = "No active season.";
    return;
  }

  const { data: players } = await supabase
    .from("players")
    .select("*")
    .eq("status", "active");

  const { data: matches } = await supabase
    .from("league_matches")
    .select("*")
    .eq("approved", true);

  // Build standings rows
  const stats = players.map(p => ({
    player: p,
    id: p.id,
    name: p.full_name,
    elo: p.rating,
    points: 0,
    wins: 0,
    losses: 0,
    opps: new Set()
  }));

  const byId = Object.fromEntries(stats.map(s => [s.id, s]));

  // count wins/losses and track opponents
  for (const m of matches) {
    if (!byId[m.player_a] || !byId[m.player_b]) continue;

    const A = byId[m.player_a];
    const B = byId[m.player_b];

    A.opps.add(B.id);
    B.opps.add(A.id);

    if (m.winner === A.id) {
      A.wins++;
      A.points += (m.match_type === "monthly_pod" ? 3 : 0);
      B.losses++;
    } else {
      B.wins++;
      B.points += (m.match_type === "monthly_pod" ? 3 : 0);
      A.losses++;
    }
  }

  // Compute percentages
  for (const s of stats) {
    s.games = s.wins + s.losses;
    s.winPct = s.games ? s.wins / s.games : 0;

    let oppTotals = 0, oppWins = 0;

    for (const oid of s.opps) {
      const o = byId[oid];
      oppTotals += o.games;
      oppWins += o.wins;
    }

    s.oppPct = oppTotals ? oppWins / oppTotals : 0;

    let oppOppTotals = 0, oppOppWins = 0;
    for (const oid of s.opps) {
      for (const oid2 of byId[oid].opps) {
        const o2 = byId[oid2];
        oppOppTotals += o2.games;
        oppOppWins += o2.wins;
      }
    }

    s.oppOppPct = oppOppTotals ? oppOppWins / oppOppTotals : 0;
  }

  // Sort by:
  stats.sort((a, b) =>
    b.points - a.points ||
    b.winPct - a.winPct ||
    b.oppPct - a.oppPct ||
    b.oppOppPct - a.oppOppPct ||
    b.elo - a.elo
  );

  loading.classList.add("hidden");
  table.classList.remove("hidden");

  let rank = 1;
  for (const s of stats) {
    const row = document.createElement("tr");
    row.className = "border-b";

    row.innerHTML = `
      <td class="p-2">${rank++}</td>
      <td class="p-2">${s.name}</td>
      <td class="p-2">${s.points}</td>
      <td class="p-2">${(s.winPct * 100).toFixed(1)}%</td>
      <td class="p-2">${(s.oppPct * 100).toFixed(1)}%</td>
      <td class="p-2">${(s.oppOppPct * 100).toFixed(1)}%</td>
      <td class="p-2">${s.elo}</td>
    `;

    body.appendChild(row);
  }
}