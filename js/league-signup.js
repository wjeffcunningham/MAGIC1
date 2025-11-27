// league-signup.js
//
// Allows a logged-in player to join the nearest active or upcoming league season.
// Creates a row in league_signups with status='active'.
// Integrates with db.js and session.js.
//

import { supabase } from "/js/supabase.js";
import {
  getCurrentPlayer,
  getActiveOrUpcomingSeason,
  listActiveSignupsForSeason,
} from "/js/db.js";

import { getLocalSession } from "/js/session.js";

const seasonInfoEl  = document.getElementById("season-info");
const signupSuccess = document.getElementById("signup-success");
const signupError   = document.getElementById("signup-error");
const joinBtn       = document.getElementById("join-btn");

let player = null;
let season = null;

async function init() {
  // Require login
  const sess = getLocalSession();
  if (!sess || !sess.playerId) {
    window.location.href = "/login.html";
    return;
  }

  // Load current player
  player = await getCurrentPlayer();
  if (!player) {
    window.location.href = "/login.html";
    return;
  }

  // Load the nearest active or upcoming season
  season = await getActiveOrUpcomingSeason();
  if (!season) {
    seasonInfoEl.textContent = "There is no upcoming league season at the moment.";
    joinBtn.disabled = true;
    return;
  }

  seasonInfoEl.textContent =
    `${season.name} (${season.start_date} → ${season.end_date})`;

  // Check if already signed up
  const signups = await listActiveSignupsForSeason(season.id);
  const already = signups.some((s) => s.player_id === player.id);

  if (already) {
    signupSuccess.textContent = "You are already registered for this league.";
    signupSuccess.classList.remove("hidden");
    joinBtn.textContent = "Already Joined ✔";
    joinBtn.disabled = true;
    return;
  }

  joinBtn.addEventListener("click", joinSeason);
}

async function joinSeason() {
  signupError.classList.add("hidden");
  signupSuccess.classList.add("hidden");

  const { error } = await supabase
    .from("league_signups")
    .insert({
      season_id: season.id,
      player_id: player.id,
      status: "active",
    });

  if (error) {
    console.error(error);
    signupError.textContent = "Could not join league. Please try again.";
    signupError.classList.remove("hidden");
    return;
  }

  signupSuccess.textContent = "Welcome! You are now registered for the league.";
  signupSuccess.classList.remove("hidden");
  joinBtn.textContent = "Joined ✔";
  joinBtn.disabled = true;
}

init();