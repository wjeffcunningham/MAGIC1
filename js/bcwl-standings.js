import { supabase } from "./config.js";

const monthSelect = document.getElementById("month-select");
const tableBody   = document.getElementById("standings-body");
const emptyMsg    = document.getElementById("standings-empty");

/* -------------------------------------
   Helpers
------------------------------------- */
function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/* -------------------------------------
   Load months
------------------------------------- */
async function loadMonths() {
  const { data, error } = await supabase
    .from("month_standings")
    .select("month_index")
    .order("month_index", { ascending: true });

  if (error || !data) return;

  const months = [...new Set(data.map(r => r.month_index))];
  clear(monthSelect);

  months.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = `Month ${m}`;
    monthSelect.appendChild(opt);
  });

  if (months.length > 0) {
    loadStandings(months[months.length - 1]);
  }
}

/* -------------------------------------
   Load standings
------------------------------------- */
async function loadStandings(monthIndex) {
  clear(tableBody);

  const { data, error } = await supabase
    .from("month_standings")
    .select(`
      points,
      ow_pct,
      players (
        id,
        full_name,
        rating
      )
    `)
    .eq("month_index", monthIndex);

  if (error || !data || data.length === 0) {
    emptyMsg.style.display = "block";
    return;
  }

  emptyMsg.style.display = "none";

  data
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if ((b.players?.rating ?? 0) !== (a.players?.rating ?? 0)) {
        return (b.players?.rating ?? 0) - (a.players?.rating ?? 0);
      }
      return (b.ow_pct ?? 0) - (a.ow_pct ?? 0);
    })
    .forEach((row, idx) => {
      const tr = document.createElement("tr");

      const player = row.players;
      const name   = player?.full_name || "Unknown";

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>
          <a href="/player.html?id=${player.id}">
            ${name}
          </a>
        </td>
        <td class="center">${row.points}</td>
        <td class="center">${player?.rating ?? "—"}</td>
        <td class="center">
          ${row.ow_pct != null ? (row.ow_pct * 100).toFixed(1) + "%" : "—"}
        </td>
      `;

      tableBody.appendChild(tr);
    });
}

/* -------------------------------------
   Init
------------------------------------- */
monthSelect?.addEventListener("change", e => {
  loadStandings(parseInt(e.target.value, 10));
});

loadMonths();