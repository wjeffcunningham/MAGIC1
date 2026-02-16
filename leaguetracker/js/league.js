/* =========================================================
   League Tracker — SUPABASE AUTHORITATIVE VERSION
========================================================= */

const ladderBody = document.getElementById("ladder-body");
const tabs = document.querySelectorAll(".tabs button");
const filterBox = document.getElementById("bcpmm-filter");
const bcpmmOnlyCheckbox = document.getElementById("bcpmm-only");

let currentMode = "bcpmm";
let supabase = null;

function slugToName(slug) {
  return (slug || "").replace(/-/g, " ");
}

function firesForStreak(n) {
  if (n >= 3) return " 🔥🔥";
  if (n >= 2) return " 🔥";
  return "";
}

async function init() {
  if (!window.auth) return;
  supabase = auth._client;
  render();
}

async function fetchLeaderboard() {

  if (currentMode === "elo") {
    const { data } = await supabase
      .from("leaderboard_elo")
      .select("*")
      .order("rating", { ascending: false });

    return data.map(r => ({
      player: r.player,
      value: r.rating
    }));
  }

  if (currentMode === "league") {
    const { data } = await supabase
      .from("leaderboard_league")
      .select("*")
      .order("points", { ascending: false });

    return data.map(r => ({
      player: r.player,
      value: r.points
    }));
  }

  // BCPMM race
  const { data } = await supabase
    .from("leaderboard_points")
    .select("*")
    .order("points", { ascending: false });

  if (!data) return [];

  if (bcpmmOnlyCheckbox.checked) {
    // subtract non-BCPMM bonuses
    const { data: bonuses } = await supabase
      .from("bonuses")
      .select("*");

    const nonBcpmm = bonuses
      .filter(b => b.bonus_type !== "bcpmm")
      .reduce((acc, b) => {
        acc[b.player] = (acc[b.player] || 0) + b.bonus_points;
        return acc;
      }, {});

    return data.map(r => ({
      player: r.player,
      value: r.points - (nonBcpmm[r.player] || 0)
    }));
  }

  return data.map(r => ({
    player: r.player,
    value: r.points
  }));
}

async function fetchBonusIcons() {
  const { data } = await supabase
    .from("bonuses")
    .select("*");

  const map = {};

  data.forEach(b => {
    if (!map[b.player]) map[b.player] = [];
    map[b.player].push(iconForBonus(b.bonus_type));
  });

  return map;
}

function iconForBonus(type) {
  switch (type) {
    case "bcpmm_champion": return "🏆";
    case "bcpmm_finals": return "🥈";
    case "bcpmm_top4": return "🥉";
    case "bcpmm_top8": return "🏅";
    case "shg_win": return "⭐";
    case "connections_win": return "✦";
    case "bcwl_month_win": return "🏁";
    default: return "";
  }
}

async function render() {

  ladderBody.innerHTML = "";

  filterBox.style.display = (currentMode === "bcpmm") ? "block" : "none";

  const rows = await fetchLeaderboard();
  const bonusIcons = await fetchBonusIcons();

  rows.forEach((r, i) => {

    const icons = bonusIcons[r.player]
      ? " " + bonusIcons[r.player].join("")
      : "";

    ladderBody.insertAdjacentHTML("beforeend", `
      <tr>
        <td class="rank">${i + 1}</td>
        <td>
          <a href="./player.html?player=${encodeURIComponent(r.player)}">
            ${slugToName(r.player)}
          </a>${icons}
        </td>
        <td class="num">${r.value}</td>
      </tr>
    `);
  });
}

tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
    render();
  });
});

bcpmmOnlyCheckbox.addEventListener("change", render);

init();