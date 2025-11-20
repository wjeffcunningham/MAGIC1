// Inject menu icon + panel into DOM
const iconHtml = `
  <img src="/assets/magic1.svg"
       id="menu-icon"
       alt="menu"
       class="menu-icon" />

  <div id="menu-panel" class="menu-panel hidden"></div>
`;

document.body.insertAdjacentHTML("beforeend", iconHtml);

// Inject CSS for icon + menu panel
const style = document.createElement("style");
style.textContent = `
  /* Responsive, larger menu icon */
  .menu-icon {
    position: fixed;
    top: 20px;
    right: 20px;
    width: min(14vw, 90px);   /* larger default size */
    height: auto;
    cursor: pointer;
    z-index: 1000;
  }

  @media (max-width: 600px) {
    .menu-icon {
      width: min(18vw, 100px);  /* even larger on small screens */
    }
  }

  /* Dropdown menu panel */
  .menu-panel {
    position: fixed;
    top: 110px;
    right: 20px;
    background: white;
    border: 2px solid black;
    padding: 15px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 999;
    display: none;
  }

  .menu-link {
    display: block;
    padding: 6px 0;
    font-size: 0.95em;
    color: black;
    text-decoration: none;
  }

  .menu-link:hover {
    text-decoration: underline;
  }
`;
document.head.appendChild(style);

// Load menu logic (relative path for GitHub Pages + custom domain)
import("./menu.js");