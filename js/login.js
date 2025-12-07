// /js/login.js
import { supabase } from "./config.js";

const emailField = document.getElementById("email");
const pwField    = document.getElementById("password");
const msg        = document.getElementById("msg");

function show(m) { msg.textContent = m; }
function busy(x) {
  document.getElementById("login-btn").disabled  = x;
  document.getElementById("signup-btn").disabled = x;
}

/* --------------------------------------------------------
   EMAIL VALIDATION
---------------------------------------------------------*/
function isValidEmail(em) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
}

/* --------------------------------------------------------
   LOGIN
---------------------------------------------------------*/
document.getElementById("login-btn").onclick = async () => {
  busy(true);
  show("");

  const email    = (emailField.value || "").trim();
  const password = pwField.value || "";

  if (!email || !password) {
    show("Fill in email and password.");
    busy(false);
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    show(error.message || "Login failed.");
    busy(false);
    return;
  }

  const uid = data.user.id;

  const { data: profile, error: profErr } = await supabase
    .from("site_users")
    .select("*")
    .eq("id", uid)
    .single();

  if (profErr || !profile) {
    show("Profile missing. Contact organizer.");
    busy(false);
    return;
  }

  if (profile.status === "pending") {
    show("Your account is pending approval.");
    busy(false);
    return;
  }

  if (profile.status === "rejected") {
    show("Your account has been rejected.");
    busy(false);
    return;
  }

  // Approved → send to league hub
  window.location.href = "/bcwl-hub.html";
};

/* --------------------------------------------------------
   SIGN-UP (Turnstile + Supabase)
---------------------------------------------------------*/
document.getElementById("signup-btn").onclick = async () => {
  busy(true);
  show("");

  const email    = (emailField.value || "").trim();
  const password = pwField.value || "";

  if (!isValidEmail(email)) {
    show("Enter a valid email address.");
    busy(false);
    return;
  }

  if (password.length < 6) {
    show("Password must be at least 6 characters.");
    busy(false);
    return;
  }

  // ----- TURNSTILE TOKEN -----
  let turnstileToken = "";
  try {
    turnstileToken =
      window.turnstile && window.turnstile.getResponse
        ? window.turnstile.getResponse()
        : "";
  } catch (e) {
    show("Verification widget not ready. Try again.");
    busy(false);
    return;
  }

  if (!turnstileToken) {
    show("Please complete the verification.");
    busy(false);
    return;
  }

  // ----- VERIFY WITH WORKER -----
  let verified = false;
  try {
    const resp = await fetch("https://magic1-turnstile-verify.wjeffcunningham.workers.dev/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnstileToken }),
    });

    const out = await resp.json();
    verified = !!out.success;
  } catch (e) {
    console.error("Turnstile verification error:", e);
    show("Verification error. Try again.");
    busy(false);
    return;
  }

  if (!verified) {
    show("Verification failed. Please try again.");
    try { window.turnstile.reset(); } catch (_) {}
    busy(false);
    return;
  }

  // ----- SUPABASE SIGN-UP -----
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    show(error.message || "Sign-up failed.");
    busy(false);
    return;
  }

  const uid = data.user.id;

  const { error: profErr } = await supabase
    .from("site_users")
    .insert({
      id: uid,
      email,
      status: "pending",
      handle: null,
      moderated_handle: null,
      avatar_url: null,
      remote_preference: "no_remote",
      bio: null,
      payment_status: null,
      is_mod: false,
    });

  if (profErr) {
    console.error("Profile creation failed:", profErr);
    show("Profile creation failed. Contact organizer.");
    busy(false);
    return;
  }

  // optional mailing list hook – ignored on error
  try {
    await supabase
      .from("mailing_list")
      .insert({ email });
  } catch (_) {}

  show("Sign-up successful. Awaiting admin approval.");
  try { window.turnstile.reset(); } catch (_) {}
  busy(false);
};