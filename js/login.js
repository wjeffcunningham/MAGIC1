// /js/login.js
import { supabase } from "./config.js";

const emailField = document.getElementById("email");
const pwField    = document.getElementById("password");
const msg        = document.getElementById("msg");

const loginBtn   = document.getElementById("login-btn");
const signupBtn  = document.getElementById("signup-btn");
const forgotBtn  = document.getElementById("forgot-btn");

// Mailing list checkbox (optional)
const mailingOpt = document.getElementById("mailing-list-opt");

function show(m) {
  msg.textContent = m || "";
}

function busy(x) {
  loginBtn.disabled  = x;
  signupBtn.disabled = x;
  if (forgotBtn) forgotBtn.disabled = x;
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
loginBtn.onclick = async () => {
  busy(true);
  show("");

  const email    = (emailField.value || "").trim();
  const password = pwField.value || "";

  if (!email || !password) {
    show("Fill in email and password.");
    busy(false);
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    show(error.message || "Login failed.");
    busy(false);
    return;
  }

  // AUTH SUCCESS
  window.location.href = "/bcwl-hub.html";
};

/* --------------------------------------------------------
   PASSWORD RESET
---------------------------------------------------------*/
if (forgotBtn) {
  forgotBtn.onclick = async () => {
    show("");

    const email = (emailField.value || "").trim();
    if (!isValidEmail(email)) {
      show("Enter your email above, then click reset.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://magic1.ca/reset-password.html"
    });

    if (error) {
      show(error.message || "Reset failed.");
      return;
    }

    show("Password reset email sent. Check your inbox.");
  };
}

/* --------------------------------------------------------
   SIGN-UP
---------------------------------------------------------*/
signupBtn.onclick = async () => {
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

  const turnstileToken = window.turnstileToken || "";
  if (!turnstileToken) {
    show("Verification required.");
    busy(false);
    return;
  }

  let verified = false;
  try {
    const resp = await fetch(
      "https://magic1-turnstile-verify.wjeffcunningham.workers.dev/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnstileToken })
      }
    );
    const out = await resp.json();
    verified = !!out.success;
  } catch {
    show("Verification error.");
    busy(false);
    return;
  }

  if (!verified) {
    show("Verification failed.");
    busy(false);
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password
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
      is_mod: false
    });

  if (profErr) {
    show("Profile creation failed.");
    busy(false);
    return;
  }

  if (mailingOpt && mailingOpt.checked) {
    try {
      await supabase
        .from("mailing_list")
        .upsert({ email }, { onConflict: "email" });
    } catch {}
  }

  show("Sign-up successful. You can now log in.");
  busy(false);
};