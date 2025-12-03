import { supabase } from "./config.js";

async function loadPending() {
  const list = document.getElementById("pending-list");

  const { data, error } = await supabase
    .from("users")
    .select("id, email, name")
    .eq("verified", false)
    .order("created_at", { ascending: true });

  if (error) {
    list.innerHTML = "<div class='muted'>Error loading pending users.</div>";
    console.error("Pending load error", error);
    return;
  }

  if (!data.length) {
    list.innerHTML = "<div class='muted'>No pending users.</div>";
    return;
  }

  list.innerHTML = data
    .map(u => `
      <div class="list-row">
        <span>${u.name} — ${u.email}</span>
        <button class="approve-btn" data-id="${u.id}">Approve</button>
      </div>
    `)
    .join("");

  document.querySelectorAll(".approve-btn").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;

      const { error } = await supabase
        .from("users")
        .update({ verified: true })
        .eq("id", id);

      if (error) {
        alert("Error approving user."); 
        console.error("approve error", error);
      } else {
        alert("User approved!");
        loadPending();
      }
    };
  });
}

loadPending();