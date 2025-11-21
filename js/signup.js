// signup.js — handles creating new accounts
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

    // Create auth user
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

    // Create players row with status = 'pending'
    const { data: player, error: pErr } = await supabase
      .from("players")
      .insert({
        full_name: fullName,
        email,
        auth_user_id: authUserId,
        status: "pending",
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
      username: player.username || "(no username yet)",
      authUserId,
    });

    // Success → go to awaiting approval page
    window.location.href = "/awaiting-approval.html";
  });
}