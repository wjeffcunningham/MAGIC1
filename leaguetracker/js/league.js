/* =========================================================
   League Tracker – PRODUCTION STABLE BUILD (FULLPASTE)
   Fixes:
   - Pagination restored (robust + clamped)
   - BCPMM checkbox toggles "championship-only" points (bcpmm_only_points)
   - Gold (no pulse): uses body.bcpmm-only + CSS
   - BCPMM totals rely on leaderboard_points (already includes Top 8 bonuses)
   - League tab uses month_standings (January) instead of full player list
     (fallbacks to leaderboard_league if month_standings missing)
   - Elo tab unchanged
   - No duplicate pager injection
========================================================= */

function getClient() {
  return window.auth ? auth._client : null;
}

/* =========================================================
   DOM SAFE INIT
========================================================= */

let ladderBody;
let tabs;

let currentMode = "bcpmm";
const PAGE_SIZE = 16;
let pageIndexByMode = { bcpmm: 0, league: 0, elo: 0 };

document.addEventListener("DOMContentLoaded", () => {
  ladderBody = document.getElementById("ladder-body");
  tabs = document.querySelectorAll(".tabs button");

  ensureBcpmmCheckbox();
  bindTabs();
  loadLeaderboard();
});

/* =========================================================
   Helpers
========================================================= */

function slugToName(slug) {
  return (slug || "")
    .split("-")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function fireIcons(n) {
  if (n >= 3) return " 🔥🔥";
  if (n === 2) return " 🔥";
  return "";
}

/* =========================================================
   BCPMM Toggle
========================================================= */

function ensureBcpmmCheckbox() {
  const box = document.getElementById("bcpmm-filter");
  const cb = document.getElementById("bcpmm-only");
  if (!box || !cb) return;

  if (!cb.dataset.bound) {
    cb.addEventListener("change", () => {
      pageIndexByMode[currentMode] = 0;
      loadLeaderboard();
    });
    cb.dataset.bound = "true";
  }
}

function isBcpmmOnly() {
  const cb = document.getElementById("bcpmm-only");
  return !!(cb && cb.checked);
}

function showBcpmmCheckbox(show) {
  const box = document.getElementById("bcpmm-filter");
  if (!box) return;
  box.style.display = show ? "block" : "none";
}

/* =========================================================
   Data Helpers
========================================================= */

async function getSlugToIdMap() {
  const supabase = getClient();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from("tournament_players")
    .select("id, slug");

  if (error || !data) return {};

  const map = {};
  data.forEach(r => (map[r.slug] = r.id));
  return map;
}

/* Trophy = BCPMM champion bonus >= 200 (from event_points_breakdown) */
async function getTrophyMap() {
  const supabase = getClient();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from("event_points_breakdown")
    .select("player, bonus_points, series");

  if (error || !data) return {};

  const map = {};
  data.forEach(row => {
    if ((row.series || "").toUpperCase() === "BCPMM" && Number(row.bonus_points) >= 200) {
      map[row.player] = true;
    }
  });
  return map;
}

/* Flames from consecutive Elo wins (rating_history deltas) */
async function getStreakMap() {
  const supabase = getClient();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from("rating_history")
    .select("player_slug, before_rating, after_rating, match_date, match_index")
    .order("match_date", { ascending: false })
    .order("match_index", { ascending: false });

  if (error || !data) return {};

  const grouped = {};
  data.forEach(r => {
    if (!grouped[r.player_slug]) grouped[r.player_slug] = [];
    grouped[r.player_slug].push(r);
  });

  const out = {};
  for (const [slug, rows] of Object.entries(grouped)) {
    let streak = 0;
    for (const r of rows) {
      if (Number(r.after_rating) > Number(r.before_rating)) streak++;
      else break;
    }
    out[slug] = streak;
  }

  return out;
}
/* =========================================================
   Pagination (stable + clamped)
========================================================= */

function renderPager(totalRows) {
  let pager = document.getElementById("ladder-pager");

  if (!pager) {
    pager = document.createElement("div");
    pager.id = "ladder-pager";
    const table = ladderBody?.closest("table");
    if (table) table.insertAdjacentElement("afterend", pager);
  }

  if (!pager) return;

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  let pageIndex = pageIndexByMode[currentMode] || 0;
  pageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
  pageIndexByMode[currentMode] = pageIndex;

  pager.innerHTML = `
    <button id="prev-page" ${pageIndex === 0 ? "disabled" : ""}>«</button>
    <span>Page ${pageIndex + 1} / ${totalPages}</span>
    <button id="next-page" ${pageIndex >= totalPages - 1 ? "disabled" : ""}>»</button>
  `;

  document.getElementById("prev-page")?.addEventListener("click", () => {
    pageIndexByMode[currentMode] = Math.max(0, (pageIndexByMode[currentMode] || 0) - 1);
    loadLeaderboard();
  });

  document.getElementById("next-page")?.addEventListener("click", () => {
    pageIndexByMode[currentMode] = (pageIndexByMode[currentMode] || 0) + 1;
    loadLeaderboard();
  });
}

/* =========================================================
   League: month_standings (January) loader
   - Uses standings as source of truth for names + points
   - Falls back to leaderboard_league if month_standings query fails
========================================================= */

async function loadJanuaryStandings(supabase) {
  // Try month_standings first (what you WANT).
  // We keep this flexible because your exact column names may vary.
  // We attempt a few sane schemas and normalize to {player, points, trophy}.
  const tries = [
    // Common: month_standings(player, month_index, points, wins, losses)
    () => supabase
      .from("month_standings")
      .select("player,points,wins,losses,month_index,month_id")
      .eq("month_index", 0)
      .order("points", { ascending: false }),

    // Alternative: month_id is used instead; month_index not present
    () => supabase
      .from("month_standings")
      .select("player,points,wins,losses,month_id")
      .order("points", { ascending: false }),

    // Minimal
    () => supabase
      .from("month_standings")
      .select("player,points")
      .order("points", { ascending: false })
  ];

  for (const fn of tries) {
    const { data, error } = await fn();
    if (!error && data && data.length) {
      // Add mini-trophy for 2-0 if wins/losses exist (your ask).
      return data.map(r => {
        const w = Number(r.wins ?? NaN);
        const l = Number(r.losses ?? NaN);
        const isTwoOh = Number.isFinite(w) && Number.isFinite(l) && w === 2 && l === 0;
        return {
          player: r.player,
          points: Number(r.points || 0),
          miniTrophy: isTwoOh ? " 🏆" : ""
        };
      });
    }
  }

  // Fallback: leaderboard_league (if month_standings is empty/missing)
  const { data: fallback } = await supabase
    .from("leaderboard_league")
    .select("player,points")
    .order("points", { ascending: false });

  return (fallback || []).map(r => ({
    player: r.player,
    points: Number(r.points || 0),
    miniTrophy: ""
  }));
}

/* =========================================================
   Load Leaderboard
========================================================= */

async function loadLeaderboard() {
  const supabase = getClient();
  if (!supabase || !ladderBody) return;

  const [slugToId, streakMap, trophyMap] = await Promise.all([
    getSlugToIdMap(),
    getStreakMap(),
    getTrophyMap()
  ]);

  let rows = [];
  let championshipOnly = false;

  if (currentMode === "elo") {
    showBcpmmCheckbox(false);
    document.body.classList.remove("bcpmm-only");

    const { data } = await supabase
      .from("leaderboard_elo")
      .select("player,rating")
      .order("rating", { ascending: false });

    rows = (data || []).map(r => ({
      player: r.player,
      value: Number(r.rating || 0),
      extra: ""
    }));
  }

  else if (currentMode === "league") {
    showBcpmmCheckbox(false);
    document.body.classList.remove("bcpmm-only");

    const standings = await loadJanuaryStandings(supabase);

    rows = (standings || []).map(r => ({
      player: r.player,
      value: Number(r.points || 0),
      extra: r.miniTrophy || ""
    }));
  }

  else {
    championshipOnly = isBcpmmOnly();
    showBcpmmCheckbox(true);
    document.body.classList.toggle("bcpmm-only", championshipOnly);

    const { data } = await supabase
      .from("leaderboard_points")
      .select("player,total_points,bcpmm_only_points")
      .order(championshipOnly ? "bcpmm_only_points" : "total_points", { ascending: false });

    rows = (data || []).map(r => ({
      player: r.player,
      value: Number(championshipOnly ? (r.bcpmm_only_points || 0) : (r.total_points || 0)),
      extra: ""
    }));
  }

  renderRows(rows, slugToId, streakMap, trophyMap, championshipOnly);
  renderPager(rows.length);
}

/* =========================================================
   Render Rows
========================================================= */

function renderRows(rows, slugToId, streakMap, trophyMap, championshipOnly) {
  ladderBody.innerHTML = "";

  const pageIndex = pageIndexByMode[currentMode] || 0;
  const start = pageIndex * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);

  slice.forEach((row, i) => {
    const rank = start + i + 1;

const streak = streakMap[row.player] || 0;


    const fire = fireIcons(streak);

    const championTrophy = trophyMap[row.player] ? " 🏆" : "";
    const leagueMini = row.extra || "";

    ladderBody.insertAdjacentHTML("beforeend", `
      <tr>
        <td class="rank">${rank}</td>
        <td class="player">
          <a href="./player.html?player=${encodeURIComponent(row.player)}">
            ${slugToName(row.player)}
          </a>${championTrophy}${leagueMini}${fire}
        </td>
        <td class="num">${row.value}</td>
      </tr>
    `);
  });
}

/* =========================================================
   Tabs
========================================================= */

function bindTabs() {
  if (!tabs) return;

  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentMode = btn.dataset.mode;
      pageIndexByMode[currentMode] = 0;
      loadLeaderboard();
    });
  });
}