// =============================================================
// admin-guard.js
// Ensures the current user:
//   1. has a valid session
//   2. is a valid player in DB
//   3. has is_admin = true
// Redirects to "/" if not authorized.
// =============================================================

import { isLoggedIn, isAdmin, clearLocalSession } from "./session.js";

/**
 * requireAdmin()
 * Ensures user is logged in AND has admin rights.
 * If not, immediately redirect to homepage.
 */
export async function requireAdmin() {
  // 1. Must be logged in
  if (!isLoggedIn()) {
    console.warn("Admin guard: not logged in, redirecting");
    clearLocalSession();
    window.location.href = "/";
    return;
  }

  // 2. Must be an admin
  const admin = await isAdmin();
  if (!admin) {
    console.warn("Admin guard: user is not admin, redirecting");
    window.location.href = "/";
    return;
  }

  // All clear
  console.log("Admin guard: access granted");
}