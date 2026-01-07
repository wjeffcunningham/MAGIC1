// /js/bcwl-hub.js
import {
  getProfile,
  CURRENT_SEASON,
  getMyLeagueMembership,
  getLeagueRoster,
  joinCurrentLeague
} from "./db.js";

const notLogged   = document.getElementById("not-logged");
// const notApproved = document.getElementById("not-approved"); // no longer used
const notJoined   = document.getElementById("not-joined");
const hubMain     = document.getElementById("hub-main");

const joinBtn     = document.getElementById("join-btn");
const paymentBox  = document.getElementById("payment-status");
const statusBox   = document.getElementById("confirmation-status");
const rosterList  = document.getElementById("roster-list");

function hideAll() {
  if (notLogged)   notLogged.style.display   = "none";
  if (notJoined)   notJoined.style.display   = "none";
  if (hubMain)     hubMain.style.display     = "none";
}

function renderRoster(roster) {
  if (!rosterList) return;
  rosterList.innerHTML = "";

  if (!roster || roster.length === 0) {
    rosterList.textContent = "No players have joined yet.";
    return;
  }

  roster.forEach(player => {
    const row = document.createElement("div");
    row.className = "roster-row";

    const name = player.moderated_handle || player.handle || player.email;

    const statusBits = [];
    statusBits.push(player.payment_status || "unpaid");
    statusBits.push(player.confirmed ? "confirmed" : "unconfirmed");

    row.innerHTML = `
      <div class="roster-name"><strong>${name}</strong></div>
      <div class="roster-meta">${statusBits.join(" • ")}</div>
    `;

    rosterList.appendChild(row);
  });
}

async function init() {
  hideAll();

  const profile = await getProfile();

  // 1) Not logged in
  if (!profile) {
    if (notLogged) notLogged.style.display = "block";
    return;
  }

  // 2) Fetch membership + roster (no approval gate)
  const [member, roster] = await Promise.all([
    getMyLeagueMembership(),
    getLeagueRoster()
  ]);

  // Setup Join button
  if (joinBtn) {
    joinBtn.onclick = async () => {
      joinBtn.disabled = true;
      joinBtn.textContent = "Joining…";

      const { error } = await joinCurrentLeague();
      if (error) {
        console.error("joinCurrentLeague error", error);
        joinBtn.disabled = false;
        joinBtn.textContent = "Join the League";
        return;
      }

      // Reload state after successful join
      await init();
    };
  }

  // 3) Logged in but not joined yet
  if (!member) {
    if (notJoined) notJoined.style.display = "block";
    return;
  }

  // 4) User IS a member → show main hub
  if (hubMain) hubMain.style.display = "block";

  if (paymentBox) {
    paymentBox.textContent = `Payment status: ${member.payment_status || "unpaid"}`;
  }

  if (statusBox) {
    statusBox.textContent = member.confirmed
      ? "Status: confirmed by organizers."
      : "Status: awaiting confirmation.";
  }

  renderRoster(roster);
}

document.addEventListener("DOMContentLoaded", init);