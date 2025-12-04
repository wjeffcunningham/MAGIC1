// /js/bcwl-hub.js
import { supabase } from "./config.js";
import { getProfile, joinLeague, leaveLeague, CURRENT_SEASON } from "./db.js";

const notLogged    = document.getElementById("not-logged");
const hubArea      = document.getElementById("hub-area");
const userNameEl   = document.getElementById("user-name");
const joinBtn      = document.getElementById("join-btn");
const leaveBtn     = document.getElementById("leave-btn");
const statusEl     = document.getElementById("status");
const playerCount  = document.getElementById("player-count");
const playerList   = document.getElementById("player-list");

const adminSection = document.getElementById("admin-section");
const pendingCount = document.getElementById("pending-count");
const pendingList  = document.getElementById("pending-list");

function displayName(profile) {
  return profile.moderated_handle || profile.handle || profile.email;
}

async function getMyMembership(userId) {
  const { data, error } = await supabase
    .from("league_members")
    .select("id, payment_status")
    .eq("user_id", userId)
    .eq("season", CURRENT_SEASON)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("membership error", error);
  }
  return data || null;
}

function updateButtons(isInLeague) {
  if (!joinBtn || !leaveBtn) return;
  joinBtn.disabled  = isInLeague;
  leaveBtn.disabled = !isInLeague;
}

async function loadLeagueMembers() {
  if (!playerList || !playerCount) return;

  playerList.innerHTML = "Loading…";

  const { data: members, error } = await supabase
    .from("league_members")
    .select("id, user_id, payment_status")
    .eq("season", CURRENT_SEASON)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("league_members error", error);
    playerList.textContent = "Error loading league members.";
    playerCount.textContent = "";
    return;
  }

  if (!members || members.length === 0) {
    playerList.textContent = "No league members yet.";
    playerCount.textContent = "0 players.";
    return;
  }

  const userIds = [...new Set(members.map(m => m.user_id))];

  const { data: users, error: usersErr } = await supabase
    .from("site_users")
    .select("id, email, handle, moderated_handle, avatar_url, remote_preference, status")
    .in("id", userIds)
    .eq("status", "approved");

  if (usersErr) {
    console.error("site_users error", usersErr);
    playerList.textContent = "Error loading player profiles.";
    playerCount.textContent = "";
    return;
  }

  const userById = new Map(users.map(u => [u.id, u]));
  const rows = [];

  for (const m of members) {
    const u = userById.get(m.user_id);
    if (!u) continue;

    const name = u.moderated_handle || u.handle || u.email;
    const avatar = u.avatar_url || "/assets/default-avatar.png";
    let remoteLabel = "In-Person Only";
    if (u.remote_preference === "remote_mtgo")   remoteLabel = "Remote OK (MTGO)";
    if (u.remote_preference === "remote_webcam") remoteLabel = "Remote OK (Webcam)";
    if (u.remote_preference === "remote_both")   remoteLabel = "Remote OK (Both)";

    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <img src="${avatar}" alt="" style="
          width:32px;height:32px;border-radius:8px;border:1px solid #000;object-fit:cover;
        ">
        <div>
          <div><strong>${name}</strong></div>
          <div class="muted" style="font-size:0.8rem;">${remoteLabel}</div>
        </div>
      </div>
    `;
    rows.push(row);
  }

  playerList.innerHTML = "";
  rows.forEach(r => playerList.appendChild(r));
  playerCount.textContent = `${rows.length} player${rows.length === 1 ? "" : "s"}.`;
}

async function loadPendingForAdmin(profile) {
  if (!adminSection || !pendingCount || !pendingList) return;
  if (!profile.is_mod) {
    adminSection.style.display = "none";
    return;
  }

  adminSection.style.display = "block";
  pendingList.innerHTML = "Loading…";

  const { data, error } = await supabase
    .from("site_users")
    .select("email, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("pending users error", error);
    pendingList.textContent = "Error loading pending signups.";
    pendingCount.textContent = "";
    return;
  }

  if (!data || data.length === 0) {
    pendingList.textContent = "No pending sign-ups.";
    pendingCount.textContent = "0 pending.";
    return;
  }

  pendingCount.textContent = `${data.length} pending signup${data.length === 1 ? "" : "s"}.`;

  pendingList.innerHTML = "";
  data.forEach(u => {
    const div = document.createElement("div");
    div.className = "muted";
    const created = u.created_at ? new Date(u.created_at).toLocaleString() : "";
    div.textContent = `${u.email} (${created})`;
    pendingList.appendChild(div);
  });
}

async function init() {
  const profile = await getProfile();

  if (!profile) {
    if (notLogged) notLogged.style.display = "block";
    if (hubArea) hubArea.style.display = "none";
    return;
  }

  if (notLogged) notLogged.style.display = "none";
  if (hubArea) hubArea.style.display = "block";

  if (userNameEl) userNameEl.textContent = displayName(profile);

  // Membership status
  const membership = await getMyMembership(profile.id);
  const inLeague = !!membership;

  if (statusEl) {
    statusEl.textContent = inLeague
      ? `You are registered for ${CURRENT_SEASON}.`
      : `You are currently not registered for ${CURRENT_SEASON}.`;
  }
  updateButtons(inLeague);

  if (joinBtn) {
    joinBtn.onclick = async () => {
      joinBtn.disabled = true;
      const { error } = await joinLeague(CURRENT_SEASON);
      if (error) {
        console.error("joinLeague error", error);
        if (statusEl) statusEl.textContent = error.message || "Could not join league.";
      } else {
        if (statusEl) statusEl.textContent = `You are registered for ${CURRENT_SEASON}.`;
        updateButtons(true);
        await loadLeagueMembers();
      }
      joinBtn.disabled = false;
    };
  }

  if (leaveBtn) {
    leaveBtn.onclick = async () => {
      leaveBtn.disabled = true;
      const { error } = await leaveLeague(CURRENT_SEASON);
      if (error) {
        console.error("leaveLeague error", error);
        if (statusEl) statusEl.textContent = error.message || "Could not leave league.";
      } else {
        if (statusEl) statusEl.textContent = `You are currently not registered for ${CURRENT_SEASON}.`;
        updateButtons(false);
        await loadLeagueMembers();
      }
      leaveBtn.disabled = false;
    };
  }

  await loadLeagueMembers();
  await loadPendingForAdmin(profile);
}

document.addEventListener("DOMContentLoaded", init);