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
        <a href="./login.html">Sign in or create an account</a>.
      `);
    }
    return;
  }

  // Profile is optional; don’t block if missing
  const profile = await getProfile();

  const membership = await getMyLeagueMembership();
  if (!membership) {
    if (page === "hub") {
      show(banner, `
        <strong>Signed in.</strong>
        You can join the league below.
      `);
    }
    return;
  }

  const parts = [];
  parts.push(`<strong>BC Winter League 2026</strong>`);

  parts.push(membership.confirmed ? `confirmed` : `awaiting confirmation`);

  if ((membership.payment_status || "unpaid") !== "paid") {
    parts.push(`payment: ${membership.payment_status || "unpaid"}`);
  }

  // Optional: display email/handle if you want
  const label = profile?.moderated_handle || profile?.handle || profile?.email || user.email;
  if (label) parts.unshift(label);

  show(banner, parts.join(" · "));
}

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