// Basic menu toggle
const menuBtn = document.getElementById("menu-btn");
const menuPanel = document.getElementById("menu-panel");

menuBtn.addEventListener("click", () => {
  menuPanel.classList.toggle("open");
});