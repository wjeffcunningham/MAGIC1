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
   LOGIN (unchanged)
---------------------------------------------------------*/
document.getElementById("login-btn").onclick = async () => {
  busy(true);
  show("");

  const email = emailField.value.trim();
  const password = pwField.value;

  if (!email || !password) {
    show("Fill all fields.");
    busy(false);
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email, password
  });

  if (error) {
    show(error.message);
    busy(false);
    return;
  }

  const uid = data.user.id;

  const { data: profile, error: profErr } = await supabase
    .from("site_users")
    .select("*")
    .eq("id", uid)
    .single();

  if (!profile || profErr) {
    show("Profile missing.");
    busy(false);
    return;
  }

  if (profile.status === "pending") {
    show("Your account is pending approval.");
    busy(false);
    return;
  }

  if (profile.status === "rejected") {
    show("Your sign-up was rejected.");
    busy(false);
    return;
  }

  // Approved → enter
  window.location.href = "/bcwl-hub.html";
};

/* --------------------------------------------------------
   SIGN-UP (Turnstile integrated)
---------------------------------------------------------*/
document.getElementById("signup-btn").onclick = async () => {
  busy(true);
  show("");

  const email = emailField.value.trim();
  const password = pwField.value;

  if (!isValidEmail(email)) {
    show("Enter a valid email.");
    busy(false);
    return;
  }

  if (password.length < 6) {
    show("Password must be at least 6 characters.");
    busy(false);
    return;
  }

  /* --------------------------------------------------------
     TURNSTILE TOKEN
  ---------------------------------------------------------*/
  let turnstileToken = "";
  try {
    turnstileToken = turnstile.getResponse();
  } catch (e) {
    show("Turnstile not ready. Try again.");
    busy(false);
    return;
  }

  if (!turnstileToken) {
    show("Please complete the verification.");
    busy(false);
    return;
  }

  /* --------------------------------------------------------
     Call Cloudflare to verify token (client → CF → Supabase)
     Replace YOUR_SECRET_ENDPOINT with your Worker URL
  ---------------------------------------------------------*/

  let verified = false;
  try {
    const v = await fetch("https://magic1-turnstile-verify.wjeffcunningham.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnstileToken })
    });
    const out = await v.json();
    verified = out.success === true;
  } catch (err) {
    show("Verification error.");
    busy(false);
    return;
  }

  if (!verified) {
    show("Verification failed.");
    try { turnstile.reset(); } catch (_) {}
    busy(false);
    return;
  }

  /* --------------------------------------------------------
     SUPABASE SIGN-UP
  ---------------------------------------------------------*/
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    show(error.message);
    busy(false);
    return;
  }

  const uid = data.user.id;

  // Create row in site_users
  const { error: profErr } = await supabase
    .from("site_users")
    .insert({
      id: uid,
      email,
      status: "pending",
      handle: null,
      remote_preference: null,
      bio: null,
      avatar_url: null
    });

    // Add email to mailing list (ignore if already exists)
await supabase
  .from("mailing_list")
  .insert({ email })
  .catch(() => {});

  if (profErr) {
    show("Profile creation failed.");
    busy(false);
    return;
  }

  show("Sign-up successful. Awaiting admin approval.");

  // Reset Turnstile for next attempt
  try { turnstile.reset(); } catch (_) {}

  busy(false);
};