// signup.js — handles creating new accounts (updated)
import { supabase } from "./supabase.js";
import { saveLocalSession } from "./session.js";

const signupForm = document.getElementById("signup-form");
const signupError = document.getElementById("signup-error");
const signupSuccess = document.getElementById("signup-success");

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    signupError.classList.add("hidden");
    signupSuccess.classList.add("hidden");

    const fd = new FormData(signupForm);

    const fullName = fd.get("full_name");
    const email = fd.get("email");
    const password = fd.get("password");
    const passwordConfirm = fd.get("password_confirm");

    if (password !== passwordConfirm) {
      signupError.textContent = "Passwords do not match.";
      signupError.classList.remove("hidden");
      return;
    }

    // NEW: form fields for our schema
    const homeStore = fd.get("home_store");
    const remotePreferenceUI = fd.get("remote_preference"); // "yes" | "sometimes" | "no"
    const remoteLocation = fd.get("remote_location") || null;
    const remoteMethods = fd.getAll("remote_methods"); // array of "MTGO"/"Webcam"

    // Convert UI → DB remote_preference
    let remote_preference;

    if (homeStore === "Remote Only") {
      remote_preference = "remote_only";
    } else if (remotePreferenceUI === "no") {
      remote_preference = "no_remote";
    } else {
      remote_preference = "remote_ok";
    }

    // -------------------------
    // Create Auth User
    // -------------------------
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authErr || !authData.user) {
      signupError.textContent = authErr?.message || "Could not create account.";
      signupError.classList.remove("hidden");
      return;
    }

    const authUserId = authData.user.id;

    // -------------------------
    // Create Player
    // -------------------------
    const { data: player, error: pErr } = await supabase
      .from("players")
      .insert({
        full_name: fullName,
        email: email,
        auth_user_id: authUserId,

        home_store: homeStore,
        remote_preference,
        remote_location: homeStore === "Remote Only" ? remoteLocation : null,
        remote_methods: remoteMethods.length ? remoteMethods : null,

        social_link: null,
        status: "pending" // matches your existing logic
      })
      .select()
      .single();

    if (pErr) {
      signupError.textContent = "Database error creating player.";
      signupError.classList.remove("hidden");
      return;
    }

    // Save local session
    saveLocalSession({
      playerId: player.id,
      fullName: player.full_name,
      username: player.username || null,
      authUserId
    });

    // Redirect to awaiting approval
    window.location.href = "/awaiting-approval.html";
  });
}
