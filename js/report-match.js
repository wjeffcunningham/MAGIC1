import { supabase, getLocalSession } from "./session.js";

const panel = document.getElementById("report-panel");
const notLoggedIn = document.getElementById("not-logged-in");
const awaiting = document.getElementById("awaiting");

const opponentSelect = document.getElementById("opponent-select");
const winnerSelect = document.getElementById("winner-select");
const matchTypeSelect = document.getElementById("match-type");

const submitBtn = document.getElementById("submit-btn");
const reportError = document.getElementById("report-error");
const reportSuccess = document.getElementById("report-success");

const session = getLocalSession();

main();

async function main() {
  if (!session) {
    notLoggedIn.classList.remove("hidden");
    return;
  }

  // load player
  const { data: me } = await supabase
    .from("players")
    .select("*")
    .eq("id", session.playerId)
    .maybeSingle();

  if (!me || me.status === "pending") {
    awaiting.classList.remove("hidden");
    return;
  }

  // load all other active players
  const { data: players } = await supabase
    .from("players")
    .select("*")
    .eq("status", "active");

  players
    .filter(p => p.id !== me.id)
    .forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.full_name;
      opponentSelect.appendChild(opt);
    });

  // winner select = [me, opponent]
  winnerSelect.innerHTML = "";
  const myOpt = document.createElement("option");
  myOpt.value = me.id;
  myOpt.textContent = me.full_name;
  winnerSelect.appendChild(myOpt);

  opponentSelect.addEventListener("change", () => {
    winnerSelect.innerHTML = "";
    const meOpt = document.createElement("option");
    meOpt.value = me.id;
    meOpt.textContent = me.full_name;
    const opp = opponentSelect.selectedOptions[0];
    const oppOpt = document.createElement("option");
    oppOpt.value = opp.value;
    oppOpt.textContent = opp.textContent;
    winnerSelect.append(meOpt, oppOpt);
  });

  panel.classList.remove("hidden");

  submitBtn.addEventListener("click", () => submitMatch(me));
}

async function submitMatch(me) {
  reportError.classList.add("hidden");
  reportSuccess.classList.add("hidden");

  const opponentId = opponentSelect.value;
  const winnerId = winnerSelect.value;
  const matchType = matchTypeSelect.value;

  const K = matchType === "masters" ? 40
          : matchType === "monthly_pod" ? 24
          : 16;

  const { error } = await supabase.from("league_matches").insert({
    pod_id: null,
    month_id: null, // admin ties these later
    player_a: me.id,
    player_b: opponentId,
    winner: winnerId,
    match_type: matchType,
    k_factor: K,
    approved: false,
    reported_by: me.id,
  });

  if (error) {
    reportError.textContent = "Could not submit match.";
    reportError.classList.remove("hidden");
    return;
  }

  reportSuccess.textContent = "Match submitted for approval.";
  reportSuccess.classList.remove("hidden");
  submitBtn.disabled = true;
}