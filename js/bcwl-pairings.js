import { supabase } from "./config.js";

/* -------------------------------------------------------
   Helpers
-------------------------------------------------------- */

function el(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}

function playerLink(id, name) {
  if (!id) {
    return document.createTextNode(name || "Unknown");
  }
  const a = document.createElement("a");
  a.href = `/player.html?id=${id}`;
  a.textContent = name || "Unknown";
  return a;
}

/* -------------------------------------------------------
   Load & Render
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

  // Group by inferred month (creation batches)
  let currentMonth = 1;
  let lastCreated = null;
  let monthBlock = null;

  data.forEach(row => {
    if (!lastCreated || new Date(row.created_at) > new Date(lastCreated)) {
      if (!monthBlock) {
        monthBlock = el("div", null, "month");
        monthBlock.appendChild(el("h2", `Month ${currentMonth}`));
        root.appendChild(monthBlock);
      }
    }

    const roundBlock = el("div", null, "round");
    roundBlock.appendChild(el("h3", `Round ${row.round}`));

    (row.data || []).forEach(match => {
      const p = el("div", null, "pairing");

      // Player 1
      p.appendChild(
        playerLink(
          match.p1_id,
          match.p1_name || "Player A"
        )
      );

      p.appendChild(el("span", " vs ", "vs"));

      // Player 2
      p.appendChild(
        playerLink(
          match.p2_id,
          match.p2_name || "Player B"
        )
      );

      roundBlock.appendChild(p);
    });

    monthBlock.appendChild(roundBlock);
    lastCreated = row.created_at;
  });
}

/* -------------------------------------------------------
   Init
-------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", loadPairings);