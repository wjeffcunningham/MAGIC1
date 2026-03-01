/* =========================================================
   PLAYER PAGE — FINAL STABLE PRODUCTION
   - Verified profile + flames
   - Expandable points buckets
   - Bonus display
   - Elo history (match-table driven results)
   - Correct chronological order (client-side sort, robust)
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
   VERIFIED PROFILE + FLAMES
========================================================= */

async function injectVerifiedProfile(supabase, slug) {
  const claimContainer = document.getElementById("claim-container");
  const nameEl = document.getElementById("player-name");
  if (!nameEl) return;

  // Prevent duplicate render (important if scripts re-run)
  if (document.querySelector(".public-profile-inline")) return;

  const { data: claim, error: claimErr } = await supabase
    .from("player_claims")
    .select("user_id")
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();

  if (claimErr) {
    // If claim lookup fails, still show claim link so page isn't blank
    if (claimContainer) {
      claimContainer.innerHTML = `
        <a class="claim-link" href="/join.html?claim=${encodeURIComponent(slug)}">
          Claim this profile
        </a>
      `;
    }
    return;
  }

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
          ? `<img src="${profile.avatar_url}" class="public-avatar-small" alt="">`
          : ""
      }
      <div>
        <div class="profile-alias-sub">
          ${(profile.alias || slugToName(slug))}
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
   POINTS BREAKDOWN (expandable buckets)
   NOTE: bonuses (BCPMM Top 8, SHG win, Connections win, league undefeated, etc.)
         should already be baked into bonus_points/final_points by your rebuild.
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

  // Stable bucket order (don’t rely on object key order)
  const ORDER = ["BCPMM", "SHG", "CONNECTIONS", "BCWL", "OTHER"];

  const buckets = { BCPMM: [], SHG: [], CONNECTIONS: [], BCWL: [], OTHER: [] };

  data.forEach((e) => {
    const k = (e.series || "").toUpperCase();
    const key =
      k === "BCPMM" ? "BCPMM" :
      k === "SHG" ? "SHG" :
      k === "CONNECTIONS" ? "CONNECTIONS" :
      k === "BCWL" ? "BCWL" :
      "OTHER";
    buckets[key].push(e);
  });

  let grandTotal = 0;

  const html = ORDER.map((series) => {
    const events = buckets[series] || [];
    if (!events.length) return "";

    const bucketTotal = events.reduce((s, e) => s + Number(e.final_points || 0), 0);
    grandTotal += bucketTotal;

    const isBCPMM = series === "BCPMM";

    return `
      <details class="points-category ${isBCPMM ? "bcpmm-bucket" : ""}">
        <summary>
          <span class="${isBCPMM ? "gold" : ""}">
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

  // Make multiplier visually “different material” (your red style) and slightly smaller
  const multHtml = `<span class="multiplier" style="font-size:0.92em">${mult}</span>`;

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
   MATCH HISTORY (match-table driven)
   Key fixes:
   - games_for/games_against are NULL in your DB, so DO NOT use them
   - Use matches table to determine win/loss/draw
   - Client-side sort to guarantee correct “most recent first”
     even when match_date is a plain date and many rows share it
========================================================= */

async function loadMatchHistory(supabase, slug) {
  const table = document.getElementById("history-table");
  if (!table) return;

  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  // Pull history (don’t over-order server-side; we’ll sort reliably client-side)
  const { data: history, error: histErr } = await supabase
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
      match_index,
      round_number,
      created_at
    `)
    .eq("player_slug", slug);

  if (histErr) {
    tbody.innerHTML = `<tr><td colspan="6">${escapeHtml(histErr.message)}</td></tr>`;
    return;
  }

  if (!history?.length) {
    tbody.innerHTML = `<tr><td colspan="6">No match history found.</td></tr>`;
    return;
  }

  // Pull matches once; include fields commonly used across your rebuilds
  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("event_id, match_index, round_number, player_a, player_b, winner");

  if (matchErr) {
    // Still render Elo rows, but with unknown results rather than crashing
    console.warn("matches lookup failed:", matchErr.message);
  }

  // Build an index for fast lookup:
  // Prefer (event_id + match_index + players) if match_index exists,
  // else fall back to (event_id + round_number + players),
  // else (event_id + players) first match found.
  const matchIndex = buildMatchIndex(matches || []);

  // Robust “most recent first” sort:
  // 1) match_date desc
  // 2) created_at desc (if present)
  // 3) round_number desc (later rounds first)
  // 4) match_index desc (later matches first)
const LEAGUE_PRIORITY = {
  bcwl: 0,
  bcpmm: 1,
  shg: 2,
  connections: 3
};

const sorted = [...history].sort((a, b) => {
  // 1) Date (newest first)
  const ad = safeTime(a.match_date);
  const bd = safeTime(b.match_date);
  if (bd !== ad) return bd - ad;

  // 2) League priority (BCWL first on same day)
  const ap = LEAGUE_PRIORITY[(a.league || "").toLowerCase()] ?? 9;
  const bp = LEAGUE_PRIORITY[(b.league || "").toLowerCase()] ?? 9;
if (ap !== bp) return bp - ap;

  // 3) Round (later rounds first)
  const ar = numOrNegInf(a.round_number);
  const br = numOrNegInf(b.round_number);
  if (br !== ar) return br - ar;

  // 4) Match index
  const am = numOrNegInf(a.match_index);
  const bm = numOrNegInf(b.match_index);
  if (bm !== am) return bm - am;

  // 5) Created_at fallback
  const ac = safeTime(a.created_at);
  const bc = safeTime(b.created_at);
  if (bc !== ac) return bc - ac;

  return 0;
});


  tbody.innerHTML = sorted
    .map((row) => {
      const delta = Number(row.after_rating || 0) - Number(row.before_rating || 0);
      const deltaColor = delta >= 0 ? "#2e7d32" : "#c62828";

      const res = computeResultFromMatches(slug, row, matchIndex);

      const isBCPMM = (row.league || "").toUpperCase() === "BCPMM";
      const eventDisplay = isBCPMM
        ? `<a href="${BCPMM_COVERAGE_URL}" target="_blank" rel="noopener">${escapeHtml(row.event_name || "")}</a>`
        : `<a href="/leaguetracker/?event=${encodeURIComponent(row.event_name || "")}">${escapeHtml(row.event_name || "")}</a>`;

      const oppSlug = row.opponent_slug || "";
      const oppLink = oppSlug
        ? `<a href="/leaguetracker/player.html?player=${encodeURIComponent(oppSlug)}">${slugToName(oppSlug)}</a>`
        : "—";

      return `
        <tr>
          <td>${escapeHtml(row.match_date || "")}</td>
          <td>${eventDisplay}</td>
          <td>${oppLink}</td>
          <td style="color:${res.color};font-weight:600">${res.label}</td>
          <td class="num" style="color:${deltaColor}">
            ${delta > 0 ? "+" : ""}${Math.round(delta)}
          </td>
          <td class="num">${Math.round(Number(row.after_rating || 0))}</td>
        </tr>
      `;
    })
    .join("");
}

function buildMatchIndex(matches) {
  const idx = {
    byEventMatchIndex: new Map(), // key: event_id|match_index|pmin|pmax
    byEventRound: new Map(),      // key: event_id|round_number|pmin|pmax
    byEventPair: new Map()        // key: event_id|pmin|pmax
  };

  matches.forEach((m) => {
    const eventId = m.event_id;
    const a = m.player_a;
    const b = m.player_b;
    if (!eventId || !a || !b) return;

    const [pmin, pmax] = a < b ? [a, b] : [b, a];

    if (m.match_index !== null && m.match_index !== undefined) {
      const k = `${eventId}|${m.match_index}|${pmin}|${pmax}`;
      if (!idx.byEventMatchIndex.has(k)) idx.byEventMatchIndex.set(k, m);
    }

    if (m.round_number !== null && m.round_number !== undefined) {
      const k = `${eventId}|${m.round_number}|${pmin}|${pmax}`;
      if (!idx.byEventRound.has(k)) idx.byEventRound.set(k, m);
    }

    const k = `${eventId}|${pmin}|${pmax}`;
    if (!idx.byEventPair.has(k)) idx.byEventPair.set(k, m);
  });

  return idx;
}

function computeResultFromMatches(slug, row, idx) {
  const unknown = { label: "—", color: "#666" };

  const eventId = row.event_id;
  const opp = row.opponent_slug;
  if (!eventId || !opp || !idx) return unknown;

  const [pmin, pmax] = slug < opp ? [slug, opp] : [opp, slug];

  // 1) Best: match_index join
  if (row.match_index !== null && row.match_index !== undefined) {
    const k = `${eventId}|${row.match_index}|${pmin}|${pmax}`;
    const m = idx.byEventMatchIndex.get(k);
    if (m) return winnerToResult(slug, m.winner);
  }

  // 2) Next: round_number join
  if (row.round_number !== null && row.round_number !== undefined) {
    const k = `${eventId}|${row.round_number}|${pmin}|${pmax}`;
    const m = idx.byEventRound.get(k);
    if (m) return winnerToResult(slug, m.winner);
  }

  // 3) Fallback: event+pair (only safe if they played once)
  {
    const k = `${eventId}|${pmin}|${pmax}`;
    const m = idx.byEventPair.get(k);
    if (m) return winnerToResult(slug, m.winner);
  }

  return unknown;
}

function winnerToResult(slug, winner) {
  if (!winner) return { label: "Draw", color: "#666" };
  if (winner === slug) return { label: "Win", color: "#2e7d32" };
  return { label: "Loss", color: "#c62828" };
}

/* =========================================================
   Small utils
========================================================= */

function numOrNegInf(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : -Infinity;
}

function safeTime(x) {
  if (!x) return 0;
  const t = Date.parse(x);
  return Number.isFinite(t) ? t : 0;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}