import { getProfile, CURRENT_SEASON } from "./db.js";
import { supabase } from "./config.js";

async function initAccountBanner() {
  const banner = document.getElementById("account-state-banner");
  if (!banner) return;

  const profile = await getProfile();
  if (!profile) return;

  const styles = `
    padding:10px 14px;
    margin:0;
    text-align:center;
    font-size:0.85rem;
    border-bottom:2px solid black;
    background:#fff8d6;
  `;

  banner.style.cssText = styles;
  banner.style.display = "block";

  if (profile.status === "pending") {
    banner.textContent =
      "Your account is awaiting moderator approval. You’ll receive an email once approved.";
    return;
  }

  // Approved — check league membership
  const { data: member } = await supabase
    .from("league_members")
    .select("id, confirmed")
    .eq("user_id", profile.id)
    .eq("season", CURRENT_SEASON)
    .single();

  if (!member) {
    banner.textContent =
      "Your account is approved, but you are not yet registered for the current league season.";
    return;
  }

  if (!member.confirmed) {
    banner.textContent =
      "You are registered for the league but not yet confirmed. Please complete payment or await confirmation.";
    return;
  }

  // Fully active → hide banner
  banner.style.display = "none";
}

document.addEventListener("DOMContentLoaded", initAccountBanner);