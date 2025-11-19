import { supabase } from "./supabase.js";

const form = document.getElementById("event-register-form");
const messageEl = document.getElementById("event-message");

// IMPORTANT:
// Replace with your real event ID from the Supabase 'events' table
const EVENT_ID = "312dbda7-0a6c-4d83-b992-23999c6a7e95";

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  messageEl.classList.add("hidden");

  const full_name = form.full_name.value.trim();
  const email = form.email.value.trim();
  const paid = form.paid.checked;

  if (!EVENT_ID) {
    messageEl.textContent = "Error: Event not configured.";
    messageEl.classList.remove("hidden");
    return;
  }

  // Step 1: upsert player
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .upsert(
      {
        full_name,
        email
      },
      { onConflict: "email" }
    )
    .select()
    .single();

  if (playerErr) {
    console.error("Player error:", playerErr);
    messageEl.textContent = "Error saving your player record.";
    messageEl.classList.remove("hidden");
    return;
  }

  // Step 2: event registration
  const { error: regErr } = await supabase
    .from("event_registrations")
    .upsert(
      {
        event_id: EVENT_ID,
        player_id: player.id,
        has_paid: paid
      },
      { onConflict: "event_id,player_id" }
    );

  if (regErr) {
    console.error("Event registration error:", regErr);
    messageEl.textContent = "Error saving your event registration.";
    messageEl.classList.remove("hidden");
    return;
  }

  // Step 3: confirm success
  messageEl.textContent = "Success! You are registered internally for the B.C. Premodern Masters (Jan 10).";
  messageEl.classList.remove("hidden");
  messageEl.classList.add("text-sky-800", "font-medium");

  form.reset();
});
