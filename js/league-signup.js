import { supabase } from "./supabase.js";

const form = document.getElementById("league-signup-form");
const messageEl = document.getElementById("signup-message");

// Replace with your actual season ID once you create it
let SEASON_ID = null;

// Step 1: Fetch the one existing season (BCWL 2026)
async function loadSeason() {
  const { data, error } = await supabase
    .from("league_seasons")
    .select("*")
    .order("start_date", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Season load error:", error);
    return;
  }

  if (data.length === 0) {
    messageEl.textContent = "No league season found. Please create one in Supabase.";
    messageEl.classList.remove("hidden");
    return;
  }

  SEASON_ID = data[0].id;
}

loadSeason();


// Step 2: Form submit handler
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  messageEl.classList.add("hidden");

  const full_name = form.full_name.value.trim();
  const email = form.email.value.trim();
  const home_store = form.home_store.value.trim();
  const remote_preference = form.remote_preference.value;
  const play_style = form.play_style.value;

  if (!SEASON_ID) {
    messageEl.textContent = "Error: Season not loaded.";
    messageEl.classList.remove("hidden");
    return;
  }

  // Step 3: Upsert player into `players`
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .upsert(
      {
        full_name,
        email,
        home_store,
        remote_preference,
        play_style
      },
      { onConflict: "email" }
    )
    .select()
    .single();

  if (playerErr) {
    console.error("Player upsert error:", playerErr);
    messageEl.textContent = "Error saving your player record.";
    messageEl.classList.remove("hidden");
    return;
  }

  // Step 4: Determine active/waiting list
  const { data: activePlayers, error: countErr } = await supabase
    .from("league_signups")
    .select("id", { count: "exact", head: true })
    .eq("season_id", SEASON_ID)
    .eq("status", "active");

  if (countErr) {
    console.error("Count error:", countErr);
    messageEl.textContent = "Error determining league availability.";
    messageEl.classList.remove("hidden");
    return;
  }

  const currentActive = activePlayers.count;
  const status = currentActive < 32 ? "active" : "waiting_list";

  // Step 5: Register player for the league
  const { error: signupErr } = await supabase
    .from("league_signups")
    .upsert(
      {
        season_id: SEASON_ID,
        player_id: player.id,
        status
      },
      { onConflict: "season_id,player_id" }
    );

  if (signupErr) {
    console.error("Signup error:", signupErr);
    messageEl.textContent = "Error saving your league signup.";
    messageEl.classList.remove("hidden");
    return;
  }

  // Step 6: UI confirmation
  if (status === "active") {
    messageEl.textContent = "Success! You are registered as an ACTIVE player in the BCWL 2026 season.";
  } else {
    messageEl.textContent = "League is full — you’ve been added to the WAITING LIST. We’ll notify you if a spot opens.";
  }

  messageEl.classList.remove("hidden");
  messageEl.classList.add("text-sky-800", "font-medium");

  // Clear form
  form.reset();
});
