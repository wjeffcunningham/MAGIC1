// /js/menu.js
import { supabase } from "/js/config.js";

export async function loadMenu() {
  const menu = document.getElementById("menu");
  if (!menu) return;

  const { data: { user } } = await supabase.auth.getUser();

  // Not logged in → minimal menu
  if (!user) {
    menu.innerHTML = `
      <a href="/login.html">Log In</a>
      <a href="/signup.html">Join the League</a>
    `;
    return;
  }

  // Load profile
  const { data: profile } = await supabase
    .from("site_users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    menu.innerHTML = `<p>Error loading profile.</p>`;
    return;
  }

  // Pending → restrict everything
  if (profile.status === "pending") {
    menu.innerHTML = `
      <p>Your account is pending approval.</p>
      <a href="/logout.html">Log Out</a>
    `;
    return;
  }

  // Approved normal user
  if (!profile.is_mod) {
    menu.innerHTML = `
      <a href="/index.html">Home</a>
      <a href="/league.html">League</a>
      <a href="/profile.html">Profile</a>
      <a href="/logout.html">Log Out</a>
    `;
    return;
  }

  // Admin
  menu.innerHTML = `
    <a href="/index.html">Home</a>
    <a href="/league.html">League</a>
    <a href="/admin.html">Admin Area</a>
    <a href="/logout.html">Log Out</a>
  `;
}