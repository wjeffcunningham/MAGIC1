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
const rosterList = document.getElementById("roster-list");

/* -------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
function hide(el) {
  if (el) el.style.display = "none";
}
function show(el) {
  if (el) el.style.display = "block";
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

    const statusBits = [
      player.payment_status || "unpaid"
    ];

    row.innerHTML = `
      <div class="roster-name"><strong>${name}</strong></div>
      <div class="roster-meta">${statusBits.join(" • ")}</div>
    `;

    rosterList.appendChild(row);
  });
}

/* -------------------------------------------------------
   INIT
-------------------------------------------------------- */
async function init() {
  hide(notLogged);
  hide(notJoined);
  hide(hubMain);

  const user = await getAuthUser();
  if (!user) {
    show(notLogged);
    return;
  }

  const [member, roster] = await Promise.all([
    getMyLeagueMembership(),
    getLeagueRoster()
  ]);

  show(hubMain);
  renderRoster(roster);

  if (!member) {
    show(notJoined);

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

    return;
  }

  if (paymentBox) {
    paymentBox.textContent =
      `Payment status: ${member.payment_status || "unpaid"}`;
  }

  if (statusBox) {
    statusBox.textContent = "Status: active member";
  }
}

document.addEventListener("DOMContentLoaded", init);