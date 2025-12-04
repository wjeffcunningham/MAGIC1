// /js/login.js
import { supabase } from "/js/config.js";

const emailEl = document.getElementById("email");
const pwEl    = document.getElementById("password");
const msg     = document.getElementById("msg");

function show(message) {
  if (msg) msg.textContent = message;
}

document.getElementById("login-btn").onclick = async () => {
  show("Signing in…");

  const email = emailEl.value.trim();
  const password = pwEl.value.trim();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    show(error.message);
    return;
  }

  show("Logged in!");
  window.location.href = "/bcwl-hub.html";
};

document.getElementById("signup-btn").onclick = async () => {
  show("Creating account…");

  const email = emailEl.value.trim();
  const password = pwEl.value.trim();

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    show(error.message);
    return;
  }

  const user = data.user;
  if (!user) {
    show("Account created. Check your email to confirm.");
    return;
  }

  // Insert matching profile row in site_users
  const { error: insertErr } = await supabase
    .from("site_users")
    .insert({
      id: user.id,
      email,
      handle: null,
      status: "pending",
      is_mod: false
    });

  if (insertErr) {
    console.error("site_users insert error", insertErr);
    show("Account created, but profile row failed. Contact admin.");
    return;
  }

  show("Account created. Pending approval.");
  window.location.href = "/user-settings.html";
};