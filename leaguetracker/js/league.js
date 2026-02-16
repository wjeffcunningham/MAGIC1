/* =========================================================
   League Tracker – SUPABASE AUTHORITATIVE
   - No JSON
   - No local Elo math
   - Reads leaderboard_elo
   - Reads leaderboard_points
   - Reads leaderboard_league
   - Uses rating_history for streak logic
========================================================= */

function getClient() {
  return window.auth ? auth._client : null;
}

const ladderBody = document.getElementById("ladder-body");
const tabs = document.querySelectorAll(".tabs button");

let currentMode = "bcpmm";

const PAGE_SIZE = 16;
let pageIndexByMode = { bcpmm: 0, league: 0, elo: 0 };

/* =========================================================
   Helpers
========================================================= */

function slugToName(slug) {
  return (slug || "").replace(/-/g, " ");
}

/* =========================================================
   STREAK LOGIC (from rating_history)
========================================================= */

async function getStreakMap() {
  const supabase = getClient();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from("rating_history")
    .select("player, result")
    .order("created_at", { ascending: false });

  if (error || !data) return {};

  const streakMap = {};
  const seen = new Set();

  for (const row of data) {
    const p = row.player;
    if (!streakMap[p]) streakMap[p] = [];

    // Only record first 3 most recent results
    if (streakMap[p].length < 3) {
      streakMap[p].push(row.result);
    }
  }

  const out = {};
  Object.entries(streakMap).forEach(([p, results]) => {
    let streak = 0;
    for (const r of results) {
      if (r === "W") streak++;
      else break;
    }
    out[p] = streak;
  });

  return out;
}

function fireIcons(n) {
  if (n >= 3) return " 🔥🔥";
  if (n >= 2) return " 🔥";
  return "";
}

/* =========================================================
   Load Leaderboard Data
========================================================= */

async function loadLeaderboard() {
  const supabase = getClient();
  if (!supabase) return;

  const streakMap = await getStreakMap();

  let tableName =
    currentMode === "elo"
      ? "leaderboard_elo"
      : currentMode === "league"
      ? "leaderboard_league"
      : "leaderboard_points";

  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .order("value", { ascending: false });

  if (error || !data) {
    ladderBody.innerHTML =
      `<tr><td colspan="3">Failed to load leaderboard.</td></tr>`;
    return;
  }

  renderRows(data, streakMap);
}

/* =========================================================
   Pagination + Render
========================================================= */

function renderRows(rows, streakMap) {
  ladderBody.innerHTML = "";

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageIndex = Math.min(
    pageIndexByMode[currentMode] || 0,
    totalPages - 1
  );

  pageIndexByMode[currentMode] = pageIndex;

  const start = pageIndex * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);

  if (!slice.length) {
    ladderBody.innerHTML =
      `<tr><td colspan="3">No data available</td></tr>`;
    return;
  }

  slice.forEach((row, i) => {
    const globalRank = start + i + 1;
    const fire = fireIcons(streakMap[row.player] || 0);

    ladderBody.insertAdjacentHTML(
      "beforeend",
      `
      <tr>
        <td class="rank">${globalRank}</td>
        <td class="player">
          <a href="./player.html?player=${encodeURIComponent(row.player)}">
            ${slugToName(row.player)}
          </a>${fire}
        </td>
        <td class="num">${row.value}</td>
      </tr>
      `
    );
  });

  updatePager(rows.length);
}

/* =========================================================
   Pager
========================================================= */

function ensurePager() {
  let pager = document.getElementById("ladder-pager");
  if (pager) return pager;

  const table = document.querySelector("table.ladder");
  if (!table) return null;

  pager = document.createElement("div");
  pager.id = "ladder-pager";
  pager.style.display = "flex";
  pager.style.justifyContent = "space-between";
  pager.style.marginTop = "1rem";

  pager.innerHTML = `
    <button id="pager-prev">«</button>
    <div id="pager-label"></div>
    <button id="pager-next">»</button>
  `;

  table.insertAdjacentElement("afterend", pager);
  return pager;
}

function updatePager(totalRows) {
  const pager = ensurePager();
  if (!pager) return;

  const prevBtn = pager.querySelector("#pager-prev");
  const nextBtn = pager.querySelector("#pager-next");
  const label = pager.querySelector("#pager-label");

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageIndex = pageIndexByMode[currentMode] || 0;

  label.textContent = `Page ${pageIndex + 1} / ${totalPages}`;

  prevBtn.disabled = pageIndex === 0;
  nextBtn.disabled = pageIndex >= totalPages - 1;

  prevBtn.onclick = () => {
    pageIndexByMode[currentMode] = Math.max(0, pageIndex - 1);
    loadLeaderboard();
  };

  nextBtn.onclick = () => {
    pageIndexByMode[currentMode] = Math.min(
      totalPages - 1,
      pageIndex + 1
    );
    loadLeaderboard();
  };
}

/* =========================================================
   Tabs
========================================================= */

tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
    pageIndexByMode[currentMode] = 0;
    loadLeaderboard();
  });
});

/* =========================================================
   Init
========================================================= */

document.addEventListener("DOMContentLoaded", loadLeaderboard);