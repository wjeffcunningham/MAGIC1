/* =====================================================
   Supabase Auth Wrapper — Hydration-Safe Production
===================================================== */

const auth = (function () {

  const SUPABASE_URL = "https://dkzdfhzlewlvfmunywal.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremRmaHpsZXdsdmZtdW55d2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNTU5OTIsImV4cCI6MjA3ODgzMTk5Mn0.zhUaZm6FkGkVEatHQ8UzU8IOj1siWJckXKZ9UgIYknI";

  if (typeof supabase === "undefined") {
    console.error("Supabase JS library not loaded.");
    return {};
  }

  const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  let _ready = false;
  let _readyPromiseResolve;

  const readyPromise = new Promise((resolve) => {
    _readyPromiseResolve = resolve;
  });

  /* =========================================
     WAIT FOR AUTH HYDRATION
  ========================================= */

  supabaseClient.auth.onAuthStateChange(() => {
    if (!_ready) {
      _ready = true;
      _readyPromiseResolve();
    }
  });

  async function ready() {
    if (_ready) return;
    await readyPromise;
  }

  /* =========================================
     SAFE SESSION ACCESS
  ========================================= */

  async function getSession() {
    await ready();
    const { data } = await supabaseClient.auth.getSession();
    return data?.session || null;
  }

  async function getUser() {
    await ready();
    const { data } = await supabaseClient.auth.getUser();
    return data?.user || null;
  }

  async function signOut() {
    await supabaseClient.auth.signOut();
    window.location.href = "/";
  }

  return {
    ready,
    getSession,
    getUser,
    signOut,
    _client: supabaseClient
  };

})();

/* =====================================================
   Expose globally
===================================================== */

window.auth = auth;