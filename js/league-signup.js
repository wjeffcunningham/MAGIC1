import { supabase, getLocalSession } from "./session.js";

const session = getLocalSession();

const notLoggedIn = document.getElementById("not-logged-in");
const awaiting = document.getElementById("awaiting-approval");
const signupPanel = document.getElementById("signup-panel");
const signupComplete = document.getElementById("signup-complete");

const joinBtn = document.getElementById("join-btn");
const signupError = document.getElementById("signup-error");
const signupSuccess = document.getElementById("signup-success");

main();

async function main() {
  if (!session) {
    notLoggedIn.classList.remove("hidden");
    return;
  }

  // Load player record
  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("id", session.playerId)
    .maybeSingle();

  if (!player) {
    notLoggedIn.classList.remove("hidden");
    return;
  }

  if (player.status === "pending") {
    awaiting.classList.remove("hidden");
    return;
  }

  // Load active season
  const { data: season } = await supabase
    .from("league_seasons")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (!season) {
    signupError.textContent = "No active league season.";
    signupError.classList.remove("hidden");
    return;
  }

  // Check if already signed up
  const { data: existing } = await supabase
    .from("league_signups")
    .select("*")
    .eq("season_id", season.id)
    .eq("player_id", player.id)
    .maybeSingle();

  if (existing) {
    signupComplete.classList.remove("hidden");
    return;
  }

  signupPanel.classList.remove("hidden");

  joinBtn.addEventListener("click", () => joinLeague(player.id, season.id));
}

async function joinLeague(playerId, seasonId) {
  signupError.classList.add("hidden");
  signupSuccess.classList.add("hidden");

  const { error } = await supabase.from("league_signups").insert({
    season_id: seasonId,
    player_id: playerId,
    status: "active",
  });

  if (error) {
    signupError.textContent = "Could not join league.";
    signupError.classList.remove("hidden");
    return;
  }

  signupSuccess.textContent = "You’ve joined the league!";
  signupSuccess.classList.remove("hidden");

  joinBtn.disabled = true;
}