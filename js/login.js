import { supabase } from "/js/config.js";

const email = document.getElementById("email");
const pw = document.getElementById("password");
const msg = document.getElementById("msg");

document.getElementById("login-btn").onclick = async () => {
  msg.textContent = "Signing in…";

  const { error } = await supabase.auth.signInWithPassword({
    email: email.value.trim(),
    password: pw.value.trim()
  });

  if (error) {
    msg.textContent = error.message;
    return;
  }

  msg.textContent = "Logged in!";
  window.location.href = "/user-settings.html";
};

document.getElementById("signup-btn").onclick = async () => {
  msg.textContent = "Creating account…";

  const { data, error } = await supabase.auth.signUp({
    email: email.value.trim(),
    password: pw.value.trim()
  });

  if (error) {
    msg.textContent = error.message;
    return;
  }

  // Basic profile row (only needed if users table is separate from auth)
await supabase.from("site_users").insert({
  id: user.id,
  email,
  handle,
  status: "pending"
});

  msg.textContent = "Account created!";
  window.location.href = "/user-settings.html";
};


