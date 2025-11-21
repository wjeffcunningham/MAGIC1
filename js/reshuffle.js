// /admin/reshuffle.js
import { supabase } from "../js/supabase.js";

const monthSelect = document.getElementById("month-select");
const runBtn = document.getElementById("run-btn");
const statusEl = document.getElementById("reshuffle-status");
const errorEl = document.getElementById("reshuffle-error");

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function clearError() {
  errorEl.classList.add("hidden");
}

async function loadMonths() {
  const { data, error } = await supabase
    .from("league_months")
    .select("id, name, start_date")
    .order("start_date");

  if (error) {
    console.error(error);
    return showError("Error loading months.");
  }

  monthSelect.innerHTML = data
    .map((m) => `<option value="${m.id}">${m.name}</option>`)
    .join("");

  if (data.length) {
    statusEl.textContent = `Ready. Currently selected: ${data[0].name}.`;
  } else {
    statusEl.textContent = "No league months found.";
  }
}

async function runReshuffle() {
  clearError();
  statusEl.textContent = "Running reshuffle…";

  const monthId = monthSelect.value;
  if (!monthId) {
    showError("No month selected.");
    return;
  }

  const { error } = await supabase.rpc("reshuffle_pods_for_month", {
    target_month: monthId,
  });

  if (error) {
    console.error(error);
    return showError("Error running reshuffle. Check console/logs.");
  }

  statusEl.textContent = "Pods reshuffled successfully for selected month.";
}

runBtn.addEventListener("click", runReshuffle);
loadMonths();