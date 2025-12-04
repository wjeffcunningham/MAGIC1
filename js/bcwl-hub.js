// /js/bcwl-hub.js

import { supabase } from "./config.js";
import { getProfile, joinLeague, leaveLeague } from "./db.js";

const notLogged     = document.getElementById("not-logged");
const hub           = document.getElementById("hub");
const nameLabel     = document.getElementById("user-name");
const joinBtn       = document.getElementById("join-btn");
const leaveBtn      = document.getElementById("leave-btn");
const joinStatus    = document.getElementById("join-status");
const playerList    = document.getElementById("player-list");
const playerCountEl = document.getElementById("player-count");
const adminSection  = document.getElementById("admin-section");

// Season code
const CURRENT_SEASON = "26-BCWL-01";

async function init() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    notLogged.style.display = "block";
    hub.classList.add("hidden");
    return;
  }

  const profile = await getProfile();
  if (!profile) {
    notLogged.style.display = "block";
    hub.classList.add("hidden");
    return;
  }

  notLogged.style.display = "none";
  hub.classList.remove("hidden");

  if (profile.status !== "approved") {
    joinStatus.textContent = "Your account is pending approval.";
    joinBtn.style.display = "none";
    leaveBtn.style.display = "none";
    return;
  }

  const displayHandle = profile.moderated_handle || profile.handle || profile.email;
  nameLabel.textContent = displayHandle;

  if (profile.is_mod) {
    adminSection.classList.remove("hidden");
  }

  // Determine membership for current season
  const member = await isCurrentSeasonMember();
  updateMembershipUI(member);

  await loadPlayers();
}

function updateMembershipUI(isMember) {
  if (isMember) {
    joinBtn.style.display = "none";
    leaveBtn.style.display = "inline-block";
    joinStatus.textContent = "You are an active league member for this season.";
  } else {
    joinBtn.style.display = "inline-block";
    leaveBtn.style.display = "none";
    joinStatus.textContent = "";
  }
}

async function isCurrentSeasonMember() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("league_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("season", CURRENT_SEASON)
    .limit(1);

  if (error) return false;
  return data && data.length > 0;
}

async function loadPlayers() {
  const { data, error } = await supabase
    .from("league_members")
    .select(`
      id,
      payment_status,
      user_id,
      site_users (handle, moderated_handle, image)
    `)
    .eq("season", CURRENT_SEASON);

  if (error) {
    playerList.innerHTML = "<p>Error loading players.</p>";
    return;
  }

  playerCountEl.textContent = data.length;
  playerList.innerHTML = "";

  if (!data.length) {
    playerList.innerHTML = "<p>No league players yet.</p>";
    return;
  }

  data.forEach(row => {
    const u = row.site_users;
    const displayHandle = (u && (u.moderated_handle || u.handle)) || "(unknown)";

    const el = document.createElement("div");
    el.className = "list-row";
    el.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <img src="${(u && u.image) || "/assets/default-avatar.png"}"
             style="width:34px; height:34px; border-radius:8px; border:1px solid #000; object-fit:cover;">
        <strong>${displayHandle}</strong>
      </div>
    `;
    playerList.appendChild(el);
  });
}

// JOIN
joinBtn.onclick = async () => {
  joinStatus.textContent = "Processing…";

  const { error } = await joinLeague(CURRENT_SEASON);
  if (error) {
    joinStatus.textContent = "Error: " + error.message;
    return;
  }

  updateMembershipUI(true);
  await loadPlayers();
};

// LEAVE
leaveBtn.onclick = async () => {
  joinStatus.textContent = "Processing…";

  const { error } = await leaveLeague(CURRENT_SEASON);
  if (error) {
    joinStatus.textContent = "Error: " + error.message;
    return;
  }

  updateMembershipUI(false);
  await loadPlayers();
};

init();