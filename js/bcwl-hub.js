// /js/bcwl-hub.js
import { supabase } from "./config.js";
import { getProfile, CURRENT_SEASON } from "./db.js";

const notLogged   = document.getElementById("not-logged");
const notApproved = document.getElementById("not-approved");
const notJoined   = document.getElementById("not-joined");
const hubMain     = document.getElementById("hub-main");
const paymentBox  = document.getElementById("payment-status");
const joinBtn     = document.getElementById("join-btn");

function hideAll() {
  notLogged.classList.add("hidden");
  notApproved.classList.add("hidden");
  notJoined.classList.add("hidden");
  hubMain.classList.add("hidden");
}

async function joinLeague(profile) {
  if (!profile) return;

  const { error } = await supabase
    .from("league_members")
    .insert({
      user_id: profile.id,
      season: CURRENT_SEASON,
      payment_status: "unpaid",
    });

  if (error) {
    console.error("joinLeague error:", error);
    alert("Could not join league. Contact organizer.");
    return;
  }

  await loadState();
}

async function loadState() {
  hideAll();

  const profile = await getProfile();

  // 1. Not logged in
  if (!profile) {
    notLogged.classList.remove("hidden");
    return;
  }

  // 2. Logged in but not approved
  if (profile.status !== "approved") {
    notApproved.classList.remove("hidden");
    return;
  }

  // 3. Approved – check membership
  const { data: members, error } = await supabase
    .from("league_members")
    .select("id, payment_status")
    .eq("user_id", profile.id)
    .eq("season", CURRENT_SEASON)
    .limit(1);

  if (error) {
    console.error("league_members lookup error:", error);
    alert("Error loading league status.");
    return;
  }

  const member = members && members.length ? members[0] : null;

  // 3a. Not yet in league → show join button
  if (!member) {
    notJoined.classList.remove("hidden");
    if (joinBtn) {
      joinBtn.onclick = () => joinLeague(profile);
    }
    return;
  }

  // 4. Already in league → show main hub
  hubMain.classList.remove("hidden");
  paymentBox.textContent =
    `Payment status: ${member.payment_status || "unpaid"}`;
}

document.addEventListener("DOMContentLoaded", loadState);