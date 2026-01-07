// /js/login.js
import { supabase } from "./config.js";

const emailField = document.getElementById("email");
const pwField    = document.getElementById("password");
const msg        = document.getElementById("msg");

// Mailing list checkbox (may or may not exist depending on page)
const mailingOpt = document.getElementById("mailing-list-opt");

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

  // 🔑 AUTH SUCCESS = ACCESS GRANTED
  window.location.href = "/bcwl-hub.html";
};

/* --------------------------------------------------------
   SIGN-UP
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

  /* --------------------------------------------------------
     TURNSTILE TOKEN (callback provided version)
  ---------------------------------------------------------*/
  const turnstileToken = window.turnstileToken || "";

  if (!turnstileToken) {
    show("Verification required. Click the checkbox again.");
    busy(false);
    return;
  }

  /* --------------------------------------------------------
     VERIFY TURNSTILE WITH WORKER
  ---------------------------------------------------------*/
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
    busy(false);
    return;
  }

  /* --------------------------------------------------------
     SUPABASE SIGN-UP
  ---------------------------------------------------------*/
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
      status: "pending",          // informational only
      handle: null,
      moderated_handle: null,
      avatar_url: null,
      remote_preference: "no_remote",
      bio: null,
      payment_status: null,
      is_mod: false
    });

  if (profErr) {
    console.error("Profile creation failed:", profErr);
    show("Profile creation failed. Contact organizer.");
    busy(false);
    return;
  }

  /* --------------------------------------------------------
     OPTIONAL MAILING LIST OPT-IN
  ---------------------------------------------------------*/
  if (mailingOpt && mailingOpt.checked) {
    try {
      await supabase
        .from("mailing_list")
        .upsert({ email }, { onConflict: "email" });
    } catch (e) {
      console.warn("Mailing list insert error (ignored):", e);
    }
  }

  // ✅ SIGN-UP SUCCESS → USER CAN PROCEED
  show("Sign-up successful. You can now log in.");
  busy(false);
};