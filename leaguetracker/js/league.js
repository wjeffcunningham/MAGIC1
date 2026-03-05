/* =========================================================
   League Tracker – PRODUCTION STABLE BUILD
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

document.addEventListener("DOMContentLoaded", function () {

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
    .map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
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

    cb.addEventListener("change", function () {

      pageIndexByMode.bcpmm = 0;

      if (currentMode === "bcpmm") loadLeaderboard();

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
   STREAK MAP
========================================================= */

function safeTime(x) {
  if (!x) return 0;
  const t = Date.parse(x);
  return Number.isFinite(t) ? t : 0;
}

function numOrNegInf(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : -Infinity;
}

function seriesPriority(series) {

  const s = (series || "").toLowerCase();

  if (s === "bcwl") return 0;
  if (s === "bcpmm") return 1;
  if (s === "shg") return 2;
  if (s === "connections") return 3;

  return 9;

}

async function getStreakMap() {

  const supabase = getClient();
  if (!supabase) return {};

  const { data: rows } = await supabase
    .from("matches")
    .select(`
      player_a,
      player_b,
      winner,
      match_date,
      round_number,
      match_index,
      created_at,
      is_elimination,
      events:event_id (
        event_date,
        series
      )
    `);

  const grouped = {};

  (rows || []).forEach(function (m) {

    if (m.player_a) {

      if (!grouped[m.player_a]) grouped[m.player_a] = [];
      grouped[m.player_a].push(m);

    }

    if (m.player_b) {

      if (!grouped[m.player_b]) grouped[m.player_b] = [];
      grouped[m.player_b].push(m);

    }

  });

  const streakMap = {};

  for (const slug in grouped) {

    const list = grouped[slug];

    const sorted = list.slice().sort(function (a, b) {

      const ad = safeTime(a.match_date) || safeTime(a.events?.event_date);
      const bd = safeTime(b.match_date) || safeTime(b.events?.event_date);

      if (bd !== ad) return bd - ad;

      const as = seriesPriority(a.events?.series);
      const bs = seriesPriority(b.events?.series);

      if (bs !== as) return bs - as;

      const ae = a.is_elimination ? 1 : 0;
      const be = b.is_elimination ? 1 : 0;

      if (be !== ae) return be - ae;

      const ar = numOrNegInf(a.round_number);
      const br = numOrNegInf(b.round_number);

      if (br !== ar) return br - ar;

      const am = numOrNegInf(a.match_index);
      const bm = numOrNegInf(b.match_index);

      if (bm !== am) return bm - am;

      return safeTime(b.created_at) - safeTime(a.created_at);

    });

    let streak = 0;

    for (const m of sorted) {

      if (!m.winner) break;

      if (!m.player_b && m.winner === slug) {
        streak++;
        continue;
      }

      if (m.winner === slug) streak++;
      else break;

    }

    streakMap[slug] = streak;

  }

  return streakMap;

}

/* =========================================================
   Pagination
========================================================= */

function renderPager(totalRows) {

  let pager = document.getElementById("ladder-pager");

  if (!pager) {

    pager = document.createElement("div");
    pager.id = "ladder-pager";

    const table = ladderBody?.closest("table");

    if (table) table.insertAdjacentElement("afterend", pager);

  }

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  let pageIndex = pageIndexByMode[currentMode] || 0;

  pageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));

  pageIndexByMode[currentMode] = pageIndex;

  pager.innerHTML = `
    <button id="prev-page" ${pageIndex === 0 ? "disabled" : ""}>«</button>
    <span>Page ${pageIndex + 1} / ${totalPages}</span>
    <button id="next-page" ${pageIndex >= totalPages - 1 ? "disabled" : ""}>»</button>
  `;

  const prevBtn = document.getElementById("prev-page");

  if (prevBtn) {

    prevBtn.onclick = function () {

      pageIndexByMode[currentMode]--;
      loadLeaderboard();

    };

  }

  const nextBtn = document.getElementById("next-page");

  if (nextBtn) {

    nextBtn.onclick = function () {

      pageIndexByMode[currentMode]++;
      loadLeaderboard();

    };

  }

}

/* =========================================================
   League tab
========================================================= */

async function loadLatestLeagueStandings(supabase) {

  const { data: latest } = await supabase
    .from("leaderboard_league")
    .select("month_index")
    .order("month_index", { ascending: false })
    .limit(1);

  if (!latest || !latest.length) return [];

  const monthIndex = latest[0].month_index;

  const { data: rows } = await supabase
    .from("leaderboard_league")
    .select("player,points")
    .eq("month_index", monthIndex)
    .order("points", { ascending: false });

  return (rows || []).map(function (r) {

    return {
      player: r.player,
      value: Number(r.points || 0)
    };

  });

}

/* =========================================================
   Load Leaderboard
========================================================= */

async function loadLeaderboard() {

  const supabase = getClient();

  if (!supabase || !ladderBody) return;

  showBcpmmCheckbox(currentMode === "bcpmm");

  const streakMap = await getStreakMap();

  let rows = [];

  if (currentMode === "elo") {

    const { data } = await supabase
      .from("leaderboard_elo")
      .select("player,rating")
      .order("rating", { ascending: false });

    rows = (data || []).map(function (r) {

      return {
        player: r.player,
        value: Number(r.rating || 0)
      };

    });

  }

  else if (currentMode === "league") {

    rows = await loadLatestLeagueStandings(supabase);

  }

  else {

    const only = isBcpmmOnly();

    const { data } = await supabase
      .from("leaderboard_points")
      .select("player,total_points,bcpmm_only_points,is_bcpmm_champion")
      .order(only ? "bcpmm_only_points" : "total_points", { ascending: false });

    rows = (data || []).map(function (r) {

      return {
        player: r.player,
        total: Number(r.total_points || 0),
        bcpmm: Number(r.bcpmm_only_points || 0),
        champion: r.is_bcpmm_champion === true
      };

    });

    if (only) rows = rows.filter(function (r) { return r.bcpmm > 0; });

    rows = rows.map(function (r) {

      return {
        player: r.player,
        value: only ? r.bcpmm : r.total,
        champion: r.champion
      };

    });

  }

  renderRows(rows, streakMap);
  renderPager(rows.length);

}

/* =========================================================
   Render Rows
========================================================= */

function renderRows(rows, streakMap) {

  ladderBody.innerHTML = "";

  const pageIndex = pageIndexByMode[currentMode] || 0;
  const start = pageIndex * PAGE_SIZE;

  rows.slice(start, start + PAGE_SIZE).forEach(function (row, i) {

    const rank = start + i + 1;

    const streak = streakMap[row.player] || 0;
    const fire = fireIcons(streak);

    const cup = row.champion ? " 🏆" : "";

    ladderBody.insertAdjacentHTML(
      "beforeend",
      `
      <tr>
        <td class="rank">${rank}</td>
        <td class="player">
          <a href="./player.html?player=${encodeURIComponent(row.player)}">
            ${slugToName(row.player)}
          </a>${cup}${fire}
        </td>
        <td class="num">${row.value}</td>
      </tr>
      `
    );

  });

}

/* =========================================================
   Tabs
========================================================= */

function bindTabs() {

  if (!tabs) return;

  tabs.forEach(function (btn) {

    btn.addEventListener("click", function () {

      tabs.forEach(function (b) {
        b.classList.remove("active");
      });

      btn.classList.add("active");

      currentMode = btn.dataset.mode;
      pageIndexByMode[currentMode] = 0;

      loadLeaderboard();

    });

  });

}