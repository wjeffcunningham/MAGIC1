import { supabase } from "./config.js";

const SEASON = "BCWL-2026";

/* -------------------------------------------------------
   Helpers
-------------------------------------------------------- */

function el(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}

function displayName(u) {
  return (
    u.moderated_handle ||
    u.handle ||
    (u.email ? u.email.replace(/@.*/, "") : "Player")
  );
}

function playerLink(id, name) {
  if (!id) return document.createTextNode(name || "Unknown");
  const a = document.createElement("a");
  a.href = `/player.html?id=${id}`;
  a.textContent = name || "Unknown";
  return a;
}

/* -------------------------------------------------------
   Load Roster (PUBLIC)
-------------------------------------------------------- */

async function loadRoster() {
  const root = document.getElementById("roster-root");
  root.innerHTML = "";

  const { data, error } = await supabase
    .from("league_members")
    .select(`
      payment_status,
      site_users (
        email,
        handle,
        moderated_handle
      )
    `)
    .eq("season", SEASON)
    .order("joined_at", { ascending: true });

  if (error) {
    console.error("roster load error", error);
    root.textContent = "Failed to load roster.";
    return;
  }

  if (!data || data.length === 0) {
    root.textContent = "No players have joined yet.";
    return;
  }

  data.forEach(m => {
    const u = m.site_users || {};
    const row = el("div", null, "roster-row");

    row.innerHTML = `
      <div class="roster-name">${displayName(u)}</div>
      <div class="roster-meta">payment: ${m.payment_status || "unpaid"}</div>
    `;

    root.appendChild(row);
  });
}

/* -------------------------------------------------------
   Load Pairings (FINALIZED)
-------------------------------------------------------- */

async function loadPairings() {
  const root = document.getElementById("pairings-root");
  root.innerHTML = "";

  const { data, error } = await supabase
    .from("pairings")
    .select(`
      id,
      round,
      data,
      created_at
    `)
    .eq("finalized", true)
    .order("created_at", { ascending: true });

  if (error) {
    root.textContent = "Error loading pairings.";
    console.error("pairings load error", error);
    return;
  }

  if (!data || data.length === 0) {
    root.appendChild(el("div", "No finalized pairings yet.", "empty"));
    return;
  }

  let month = 1;
  let monthBlock = null;

  data.forEach(row => {
    if (!monthBlock) {
      monthBlock = el("div", null, "month");
      monthBlock.appendChild(el("h2", `Month ${month}`));
      root.appendChild(monthBlock);
    }

    const roundBlock = el("div", null, "round");
    roundBlock.appendChild(el("h3", `Round ${row.round}`));

    (row.data || []).forEach(match => {
      const p = el("div", null, "pairing");

      p.appendChild(playerLink(match.p1_id, match.p1_name));
      p.appendChild(el("span", " vs ", "vs"));
      p.appendChild(playerLink(match.p2_id, match.p2_name));

      roundBlock.appendChild(p);
    });

    monthBlock.appendChild(roundBlock);
  });
}

/* -------------------------------------------------------
   Init
-------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  await loadRoster();
  await loadPairings();
});