/* =====================================================
   Global Auth (read-only)
   - Single Supabase client
   - No mutations beyond signOut
===================================================== */

const auth = (() => {
  const supabaseClient = window.supabase.createClient(
    "https://dkzdfhzlewlvfmunywal.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremRmaHpsZXdsdmZtdW55d2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNTU5OTIsImV4cCI6MjA3ODgzMTk5Mn0.zhUaZm6FkGkVEatHQ8UzU8IOj1siWJckXKZ9UgIYknI"
  );

  async function getUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user || null;
  }

  async function signOut() {
    await supabaseClient.auth.signOut();
    location.reload();
  }

  return {
    getUser,
    signOut,
    _client: supabaseClient // exposed for controlled DB access
  };
})();

/* =====================================================
   Expose globally so other scripts can access it
===================================================== */
window.auth = auth;