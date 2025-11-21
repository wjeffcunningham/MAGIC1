import { supabase } from "./supabase.js";

const form = document.getElementById("signup-form");
const errEl = document.getElementById("signup-error");
const okEl = document.getElementById("signup-success");

function showError(msg) {
  errEl.textContent = msg;
  errEl.classList.remove("hidden");
  okEl.classList.add("hidden");
}

function showSuccess(msg) {
  okEl.textContent = msg;
  okEl.classList.remove("hidden");
  errEl.classList.add("hidden");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errEl.classList.add("hidden");
  okEl.classList.add("hidden");

  const fd = new FormData(form);
  const fullName = String(fd.get("full_name") || "").trim();
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const passwordConfirm = String(fd.get("password_confirm") || "");

  if (!fullName || !email || !password || !passwordConfirm) {
    showError("Please fill in all fields.");
    return;
  }

  if (password !== passwordConfirm) {
    showError("Passwords do not match.");
    return;
  }

  if (password.length < 8) {
    showError("Password must be at least 8 characters.");
    return;
  }

  // 1) Create Supabase Auth user
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authErr) {
    const msg =
      authErr.message?.includes("already registered") ||
      authErr.message?.includes("User already")
        ? "An account with this email already exists. Try logging in instead."
        : "Error creating account: " + authErr.message;
    showError(msg);
    return;
  }

  const authUser = authData.user;
  if (!authUser) {
    showError("Unexpected error creating account.");
    return;
  }

  const authUserId = authUser.id;

  // 2) See if a players row already exists for this email
  const { data: existing, error: playerErr } = await supabase
    .from("players")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (playerErr) {
    console.error(playerErr);
    showError("Error checking existing player record.");
    return;
  }

  if (existing) {
    // If already linked to another auth, don't overwrite silently.
    if (existing.auth_user_id && existing.auth_user_id !== authUserId) {
      showError(
        "This email is already linked to another account. Please contact the organizer."
      );
      return;
    }

    // Update existing player row
    const { error: updErr } = await supabase
      .from("players")
      .update({
        full_name: existing.full_name || fullName,
        auth_user_id: authUserId,
        // keep existing status (could be pending/active/etc.)
      })
      .eq("id", existing.id);

    if (updErr) {
      console.error(updErr);
      showError("Error linking account to player record.");
      return;
    }
  } else {
    // 3) Create a new players row in 'pending' state
    const { error: insErr } = await supabase.from("players").insert({
      full_name: fullName,
      email,
      auth_user_id: authUserId,
      status: "pending", // will be approved by admin
      // remote_preference, play_style, rating use defaults
    });

    if (insErr) {
      console.error(insErr);
      showError("Error creating player record.");
      return;
    }
  }

  showSuccess(
    "Account created. Once Stronghold confirms your registration, your access will be activated."
  );

  // Redirect to awaiting-approval page after short delay
  setTimeout(() => {
    window.location.href = "/awaiting-approval.html";
  }, 1500);
});