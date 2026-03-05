/* =========================================================
   PLAYER PAGE — FINAL STABLE PRODUCTION
========================================================= */

function getClient() {
  return window.auth ? auth._client : null;
}

function slugToName(slug) {
  return (slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getPlayerParam() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("player") || "").trim();
}

const BCPMM_COVERAGE_URL = "https://magic1.ca/bcpmm/BCPMM_coverage.html";

/* ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

  const supabase = getClient();
  if (!supabase) return;

  const slug = getPlayerParam();
  if (!slug) return;

  const nameEl = document.getElementById("player-name");
  if (nameEl) nameEl.textContent = slugToName(slug);

  await injectVerifiedProfile(supabase, slug);
  await loadPoints(supabase, slug);
  await loadMatchHistory(supabase, slug);

});

/* =========================================================
   VERIFIED PROFILE
========================================================= */

async function injectVerifiedProfile(supabase, slug) {

  const claimContainer = document.getElementById("claim-container");
  const nameEl = document.getElementById("player-name");
  if (!nameEl) return;

  if (document.querySelector(".public-profile-inline")) return;

  const { data: claim } = await supabase
    .from("player_claims")
    .select("user_id")
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();

  if (!claim) {

    if (claimContainer) {
      claimContainer.innerHTML = `
        <a class="claim-link" href="/join.html?claim=${encodeURIComponent(slug)}">
          Claim this profile
        </a>
      `;
    }

    return;
  }

  if (claimContainer) claimContainer.innerHTML = "";

  const { data: profile } = await supabase
    .from("public_users")
    .select("alias, quote, local_store, avatar_url")
    .eq("id", claim.user_id)
    .maybeSingle();

  if (!profile) return;

  const block = document.createElement("div");
  block.className = "public-profile-inline";

  block.innerHTML = `
    <div class="profile-inline-header">
      ${
        profile.avatar_url
          ? `<img src="${profile.avatar_url}" class="public-avatar-small">`
          : ""
      }
      <div>
        <div class="profile-alias-sub">
          ${profile.alias || slugToName(slug)}
        </div>
        <div class="profile-verified-inline">Verified ✓</div>
      </div>
    </div>

    ${profile.quote ? `<div class="profile-quote-inline">"${escapeHtml(profile.quote)}"</div>` : ""}

    ${
      profile.local_store
        ? `<div class="profile-store-inline">Local Store: ${escapeHtml(profile.local_store)}</div>`
        : ""
    }
  `;

  nameEl.insertAdjacentElement("afterend", block);

}

/* =========================================================
   POINTS BREAKDOWN
========================================================= */

async function loadPoints(supabase, slug) {

  const container = document.getElementById("points-breakdown");
  if (!container) return;

  const { data, error } = await supabase
    .from("event_points_breakdown")
    .select(`
      event_name,
      event_date,
      series,
      base_match_points,
      multiplier,
      points_from_matches,
      bonus_points,
      final_points
    `)
    .eq("player", slug)
    .order("event_date", { ascending: false });

  if (error) {
    container.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data?.length) {
    container.innerHTML = "<p>No points data.</p>";
    return;
  }

  const ORDER = ["BCPMM","SHG","CONNECTIONS","BCWL","OTHER"];

  const buckets = {
    BCPMM: [],
    SHG: [],
    CONNECTIONS: [],
    BCWL: [],
    OTHER: []
  };

  data.forEach(e => {

    const s = (e.series || "").toLowerCase();

    let key = "OTHER";

    if (s === "bcpmm") key = "BCPMM";
    else if (s === "shg") key = "SHG";
    else if (s === "connections") key = "CONNECTIONS";
    else if (s === "bcwl") key = "BCWL";

    buckets[key].push(e);

  });

  let grandTotal = 0;

  const html = ORDER.map(series => {

    const events = buckets[series] || [];
    if (!events.length) return "";

    const bucketTotal =
      events.reduce((s,e)=>s + Number(e.final_points || 0),0);

    grandTotal += bucketTotal;

    const isBCPMM = series === "BCPMM";

    return `
      <details class="points-category ${isBCPMM ? "bcpmm-bucket":""}">
        <summary>
          <span class="${isBCPMM ? "gold":""}">
            ${series} — ${bucketTotal}
          </span>
        </summary>

        <div class="points-sub">
          ${events.map(renderPointsEvent).join("")}
        </div>

      </details>
    `;

  }).join("");

  container.innerHTML = `
    ${html}
    <div class="race-total">
      <strong>Total Points — ${grandTotal}</strong>
    </div>
  `;

}

function renderPointsEvent(e) {

  const base = Number(e.base_match_points || 0);
  const mult = Number(e.multiplier || 1);
  const fromMatches = Number(e.points_from_matches || 0);
  const bonus = Number(e.bonus_points || 0);
  const finalPts = Number(e.final_points || 0);

  const multHtml =
    `<span class="multiplier" style="font-size:0.92em">${mult}</span>`;

  return `
    <div class="points-event">

      <div class="event-title">
        ${escapeHtml(e.event_name || "")} — <strong>${finalPts}</strong>
      </div>

      <div class="event-line">
        <span>${base}</span>
        <span> × </span>
        ${multHtml}
        <span> = </span>
        <span>${fromMatches}</span>
      </div>

      ${bonus > 0 ? `<div class="bonus">+${bonus} bonus</div>` : ""}

    </div>
  `;
}

/* =========================================================
   MATCH HISTORY
========================================================= */

async function loadMatchHistory(supabase, slug) {

  const table = document.getElementById("history-table");
  if (!table) return;

  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const { data: history } = await supabase
    .from("rating_history")
    .select(`
      id,
      event_id,
      event_name,
      league,
      match_date,
      opponent_slug,
      before_rating,
      after_rating,
      games_for,
      games_against,
      match_index,
      round_number,
      created_at
    `)
    .eq("player_slug", slug);

  if (!history?.length) {

    tbody.innerHTML =
      `<tr><td colspan="6">No match history found.</td></tr>`;

    return;
  }

  const sorted = [...history].sort((a,b)=>{

    const ad = safeTime(a.match_date);
    const bd = safeTime(b.match_date);
    if (bd !== ad) return bd - ad;

    const ar = Number(a.round_number || 0);
    const br = Number(b.round_number || 0);
    if (br !== ar) return br - ar;

    const am = Number(a.match_index || 0);
    const bm = Number(b.match_index || 0);
    if (bm !== am) return bm - am;

    return safeTime(b.created_at) - safeTime(a.created_at);

  });

  tbody.innerHTML = sorted.map(row=>{

    const delta =
      Number(row.after_rating || 0) -
      Number(row.before_rating || 0);

    const deltaColor = delta >= 0 ? "#2e7d32" : "#c62828";

    const oppSlug = row.opponent_slug || "";

    const oppLink = oppSlug
      ? `<a href="/leaguetracker/player.html?player=${encodeURIComponent(oppSlug)}">${slugToName(oppSlug)}</a>`
      : "—";

    let result = "—";

    if (row.games_for !== null && row.games_against !== null) {
      result = `${row.games_for}-${row.games_against}`;
    }

    return `
      <tr>
        <td>${escapeHtml(row.match_date)}</td>
        <td>${escapeHtml(row.event_name)}</td>
        <td>${oppLink}</td>
        <td>${result}</td>
        <td class="num" style="color:${deltaColor}">
          ${delta > 0 ? "+" : ""}${Math.round(delta)}
        </td>
        <td class="num">${Math.round(row.after_rating || 0)}</td>
      </tr>
    `;

  }).join("");

}

/* ========================================================= */

function safeTime(x) {
  if (!x) return 0;
  const t = Date.parse(x);
  return Number.isFinite(t) ? t : 0;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}