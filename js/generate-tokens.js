// TEMPORARY BYPASS — show token UI even when logged out

console.warn("TEMPORARY: generate-tokens.js bypassed");

document.getElementById("players-container").innerHTML = `
  <p style="color:red; font-weight:bold;">
    TEMPORARY MODE<br>
    This page is bypassing login and admin checks.<br>
    Click a player to generate a login link.
  </p>
  <p>Loading player list...</p>
`;

import { supabase } from "./supabase.js";

// load all players
async function loadPlayers() {
  const { data: players, error } = await supabase
    .from("players")
    .select("id, full_name, username");

  if (error) {
    document.getElementById("players-container").innerHTML =
      "<p>Error loading players.</p>";
    return;
  }

  document.getElementById("players-container").innerHTML =
    players
      .map(
        (p) => `
      <div style="padding:8px;border:1px solid #000;cursor:pointer;"
           onclick="window.location.href='/admin/magic-generate.html?player=${p.id}'">
        ${p.full_name} (${p.username || "no username"})
      </div>`
      )
      .join("");
}

loadPlayers();