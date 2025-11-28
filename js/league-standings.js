import { supabase } from "./session.js";

const body = document.getElementById("standings-body");
const info = document.getElementById("season-info");

main();
async function main() {
  const { data: s } = await supabase
    .from("league_seasons")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (!s) {
    info.textContent = "No active league season.";
    return;
  }

  info.textContent = `${s.name} — Standings`;

  const { data: players } = await supabase.from("players").select("*");

  const { data: signups } = await supabase
    .from("league_signups")
    .select("*")
    .eq("season_id", s.id)
    .eq("status", "active");

  const activeIds = new Set(signups.map(x => x.player_id));

  const filtered = players.filter(p => activeIds.has(p.id));

  const rows = [];

  for (const p of filtered) {
    const stats = await computeStats(p.id, s.id);
    rows.push({ player: p, ...stats });
  }

  rows.sort((a, b) =>
    b.league_points - a.league_points ||
    b.comp_pct - a.comp_pct ||
    b.gw_pct - a.gw_pct ||
    b.omw_pct - a.omw_pct ||
    b.elo - a.elo
  );

  body.innerHTML = rows
    .map(r => `
      <tr class="border-b">
        <td class="py-1">${r.player.full_name}</td>
        <td class="text-right">${r.league_points}</td>
        <td class="text-right">${(r.comp_pct*100).toFixed(1)}%</td>
        <td class="text-right">${(r.gw_pct*100).toFixed(1)}%</td>
        <td class="text-right">${(r.omw_pct*100).toFixed(1)}%</td>
        <td class="text-right">${r.elo}</td>
      </tr>
    `)
    .join("");
}

async function computeStats(playerId, seasonId) {
  const { data: months } = await supabase
    .from("league_months")
    .select("*")
    .eq("season_id", seasonId);

  const monthIds = months.map(m => m.id);

  const { data: matches } = await supabase
    .from("league_matches")
    .select("*")
    .in("month_id", monthIds)
    .or(`player_a.eq.${playerId},player_b.eq.${playerId}`);

  const league_points = matches
    .filter(m => m.winner === playerId && m.approved)
    .length * 3;

  const compMatches = matches.filter(m => m.k_factor === 40);
  const compWins = compMatches.filter(m => m.winner === playerId).length;
  const comp_pct = compMatches.length ? compWins / compMatches.length : 0;

  const gamesPlayed = matches.length;
  const gamesWon = matches.filter(m => m.winner === playerId).length;
  const gw_pct = gamesPlayed ? gamesWon / gamesPlayed : 0;

  const opponents = matches.map(m => (m.player_a === playerId ? m.player_b : m.player_a));
  let omw = 0;

  for (const opp of opponents) {
    const oppMatches = matches.filter(m => m.player_a === opp || m.player_b === opp);
    const oppWins = oppMatches.filter(m => m.winner === opp).length;
    omw += oppMatches.length ? oppWins / oppMatches.length : 0;
  }

  const omw_pct = opponents.length ? omw / opponents.length : 0;

  return {
    league_points,
    comp_pct,
    gw_pct,
    omw_pct,
    elo: (await supabase.from("players").select("rating").eq("id", playerId).single()).data.rating
  };
}