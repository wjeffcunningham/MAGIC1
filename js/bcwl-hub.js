import { supabase } from "./config.js";
import { getProfile } from "./db.js";

const notLogged    = document.getElementById("not-logged");
const notApproved  = document.getElementById("not-approved");
const notJoined    = document.getElementById("not-joined");
const hubMain      = document.getElementById("hub-main");
const paymentBox   = document.getElementById("payment-status");
const joinBtn      = document.getElementById("join-btn");

function hideAll() {
  notLogged.style.display   = "none";
  notApproved.style.display = "none";
  notJoined.style.display   = "none";
  hubMain.style.display     = "none";
}

async function init() {
  hideAll();

  // 1. Auth check
  const { data: auth } = await supabase.auth.getUser();
  if (!auth || !auth.user) {
    notLogged.style.display = "block";
    return;
  }

  // 2. Get site_users profile
  const profile = await getProfile();
  if (!profile) {
    notLogged.style.display = "block";
    return;
  }

  // normalize status
  const status = (profile.status || "").trim().toLowerCase();

  // 3. Approved?
  if (status !== "approved") {
    notApproved.style.display = "block";
    return;
  }

  // 4. Check league membership
  const { data: member, error } = await supabase
    .from("league_members")
    .select("*")
    .eq("user_id", profile.id)
    .eq("season", "BCWL-2026")
    .maybeSingle();

  if (error) {
    console.error("League lookup error", error);
    notJoined.style.display = "block";
    return;
  }

  if (!member) {
    notJoined.style.display = "block";
    return;
  }

  // 5. User IS a member → show main hub!
  hubMain.style.display = "block";

  paymentBox.textContent = `Payment status: ${member.payment_status || "unpaid"}`;
}

document.addEventListener("DOMContentLoaded", init);