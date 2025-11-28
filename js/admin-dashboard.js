import { getLocalSession, isAdmin } from "./session.js";

const notAdmin = document.getElementById("not-admin");
const adminContent = document.getElementById("admin-content");

main();

async function main() {
  const session = getLocalSession();
  if (!session) return showDenied();

  const ok = await isAdmin();
  if (!ok) return showDenied();

  adminContent.classList.remove("hidden");
}

function showDenied() {
  notAdmin.classList.remove("hidden");
  adminContent.classList.add("hidden");
}