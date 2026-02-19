/* =====================================================
   Supabase Auth Bootstrap — Magic1 (PRODUCTION)
===================================================== */

const auth = (function () {

  // Prevent double initialization
  if (window.auth && window.auth._client) {
    return window.auth;
  }

  const SUPABASE_URL = "https://auth.magic1.ca";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremRmaHpsZXdsdmZtdW55d2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNTU5OTIsImV4cCI6MjA3ODgzMTk5Mn0.zhUaZm6FkGkVEatHQ8UzU8IOj1siWJckXKZ9UgIYknI";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Supabase configuration missing.");
    return {};
  }

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

  async function getUser() {
    const { data } = await supabaseClient.auth.getUser();
    return data?.user || null;
  }

  async function signOut() {
    await supabaseClient.auth.signOut();
    window.location.href = "/";
  }

  return {
    getUser,
    signOut,
    _client: supabaseClient
  };

})();

/* =====================================================
   Expose globally
===================================================== */
window.auth = auth;