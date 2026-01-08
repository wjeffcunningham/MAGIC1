// /js/bcwl-hub.js
import {
  getAuthUser,
  getMyLeagueMembership,
  getLeagueRoster,
  joinCurrentLeague
} from "./db.js";

/* -------------------------------------------------------
   DOM ELEMENTS
-------------------------------------------------------- */
const notLogged  = document.getElementById("not-logged");
const notJoined  = document.getElementById("not-joined");
const hubMain    = document.getElementById("hub-main");

const joinBtn    = document.getElementById("join-btn");
const paymentBox = document.getElementById("payment-status");
const statusBox  = document.getElementById("confirmation-status");

const rosterList =
  document.getElementById("roster-list-main") ||
  document.getElementById("roster-list-not-joined");

/* -------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
function hideAll() {
  if (notLogged) notLogged.style.display = "none";
  if (notJoined) notJoined.style.display = "none";
  if (hubMain)   hubMain.style.display   = "none";
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

    const name =
      player.moderated_handle ||
      player.handle ||
      player.email ||
      "Player";

    row.innerHTML = `
      <div class="roster-name"><strong>${name}</strong></div>
      <div class="roster-meta">
        ${player.payment_status || "unpaid"}
      </div>
    `;

    rosterList.appendChild(row);
  });
}

/* -------------------------------------------------------
   INIT
-------------------------------------------------------- */
async function init() {
  hideAll();

  // 1) Auth check
  const user = await getAuthUser();
  if (!user) {
    if (notLogged) notLogged.style.display = "block";
    return;
  }

  // 2) Fetch league data
  const [member, roster] = await Promise.all([
    getMyLeagueMembership(),
    getLeagueRoster()
  ]);

  // Wire Join button
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

      init();
    };
  }

  // 3) Logged in, not joined
  if (!member) {
    if (notJoined) notJoined.style.display = "block";
    renderRoster(roster);
    return;
  }

  // 4) Member view
  if (hubMain) hubMain.style.display = "block";

  if (paymentBox) {
    paymentBox.textContent =
      `Payment status: ${member.payment_status || "unpaid"}`;
  }

  if (statusBox) {
    statusBox.textContent = "Status: active league member.";
  }

  renderRoster(roster);
}

document.addEventListener("DOMContentLoaded", init);