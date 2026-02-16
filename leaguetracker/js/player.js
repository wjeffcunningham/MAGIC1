/* =========================================================
   Player Page — SUPABASE AUTHORITATIVE
========================================================= */

let supabase = null;

function slugToName(slug) {
  return (slug || "").replace(/-/g, " ");
}

function getParam() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("player") || "").trim();
}

async function init() {
  if (!window.auth) return;
  supabase = auth._client;
  render();
}

async function render() {

  const player = getParam();
  if (!player) return;

  document.getElementById("player-name").textContent = slugToName(player);
  document.getElementById("player-meta").textContent = `Player slug: ${player}`;

  await renderPoints(player);
  await renderHistory(player);
}

/* =========================================================
   POINTS
========================================================= */

async function renderPoints(player) {

  const body = document.querySelector("#points-table tbody");
  body.innerHTML = "";

  const { data: row } = await supabase
    .from("leaderboard_points")
    .select("*")
    .eq("player", player)
    .maybeSingle();

  const { data: bonuses } = await supabase
    .from("bonuses")
    .select("*")
    .eq("player", player);

  const bonusMap = {};
  bonuses.forEach(b => {
    bonusMap[b.bonus_type] = (bonusMap[b.bonus_type] || 0) + b.bonus_points;
  });

  const rows = [
    ["Total Points", row?.points || 0],
    ["BCPMM Champion Bonus 🏆", bonusMap["bcpmm_champion"] || 0],
    ["BCPMM Finals 🥈", bonusMap["bcpmm_finals"] || 0],
    ["BCPMM Top 4 🥉", bonusMap["bcpmm_top4"] || 0],
    ["BCPMM Top 8 🏅", bonusMap["bcpmm_top8"] || 0],
    ["SHG Win ⭐", bonusMap["shg_win"] || 0],
    ["Connections Win ✦", bonusMap["connections_win"] || 0],
    ["Monthly League 🏁", bonusMap["bcwl_month_win"] || 0]
  ];

  rows.forEach(r => {
    body.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${r[0]}</td>
        <td class="num">${r[1]}</td>
      </tr>
    `);
  });
}

/* =========================================================
   MATCH HISTORY (ELO + DECKLIST LINKS)
========================================================= */

async function renderHistory(player) {

  const body = document.querySelector("#history-table tbody");
  body.innerHTML = "";

  const { data: history } = await supabase
    .from("rating_history")
    .select("*")
    .eq("player", player)
    .order("created_at", { ascending: false });

  if (!history || !history.length) {
    body.innerHTML = `<tr><td colspan="6">No matches recorded.</td></tr>`;
    return;
  }

  for (const h of history) {

    const { data: match } = await supabase
      .from("matches")
      .select("*")
      .eq("id", h.match_id)
      .maybeSingle();

    const { data: event } = await supabase
      .from("tournaments")
      .select("name,series,event_date")
      .eq("id", match.event_id)
      .maybeSingle();

    const opponent = match.player_a === player
      ? match.player_b
      : match.player_a;

    const score = `${match.games_a}-${match.games_b}`;
    const delta = h.delta > 0 ? `+${h.delta}` : h.delta;

    // Decklist link for BCPMM top 8 elimination
    let deckLink = "";
    if (event.series.toLowerCase().includes("bcpmm") && match.is_elimination) {
      const { data: deck } = await supabase
        .from("decklists")
        .select("url")
        .eq("player", player)
        .eq("event_id", match.event_id)
        .maybeSingle();

      if (deck?.url) {
        deckLink = ` <a href="${deck.url}" target="_blank">📜</a>`;
      }
    }

    body.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${event.event_date}</td>
        <td>${event.name}</td>
        <td>
          <a href="./player.html?player=${encodeURIComponent(opponent)}">
            ${slugToName(opponent)}
          </a>
        </td>
        <td>${score}${deckLink}</td>
        <td class="num">${delta}</td>
        <td class="num">${h.rating_after}</td>
      </tr>
    `);
  }
}

init();