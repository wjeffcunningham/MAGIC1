// /js/account-state.js
import { getAuthUser, getProfile, getMyLeagueMembership } from "./db.js";

export async function renderAccountStateBanner({ page }) {
  const banner = document.getElementById("account-state-banner");
  if (!banner) return;

  banner.style.display = "none";
  banner.innerHTML = "";

  const user = await getAuthUser();
  if (!user) {
    if (page === "hub" || page === "players") {
      show(banner, `
        <strong>Not logged in.</strong>
        <a href="/login.html">Sign in or create an account</a> to join the league.
      `);
    }
    return;
  }

  const profile = await getProfile();
  if (!profile) return;

  if (profile.status === "pending") {
    show(banner, `
      <strong>Account pending approval.</strong>
      You’ll be able to join once a moderator approves your signup.
    `);
    return;
  }

  const membership = await getMyLeagueMembership();

  if (!membership) {
    if (page === "hub") {
      show(banner, `
        <strong>Approved account.</strong>
        You can now join the league below.
      `);
    }
    return;
  }

  // Member states
  const parts = [];
  parts.push(`<strong>BC Winter League 2026</strong>`);

  if (!membership.confirmed) {
    parts.push(`awaiting confirmation`);
  } else {
    parts.push(`confirmed`);
  }

  if (membership.payment_status !== "paid") {
    parts.push(`payment: ${membership.payment_status}`);
  }

  show(banner, parts.join(" · "));
}

/* ------------------------------ */

function show(el, html) {
  el.innerHTML = html;
  el.style.display = "block";
  el.style.padding = "10px 12px";
  el.style.marginBottom = "14px";
  el.style.borderRadius = "8px";
  el.style.border = "1px solid #ddd";
  el.style.background = "#f9f9ff";
  el.style.fontSize = "0.85rem";
}