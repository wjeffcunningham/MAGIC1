// Inject menu icon + panel
const html = `
  <img src="/assets/magic1.svg" id="menu-icon" class="menu-icon" />

  <div id="menu-panel" class="menu-panel" style="display:none;"></div>
`;

document.body.insertAdjacentHTML("beforeend", html);


// Inject responsive CSS for icon + menu
const style = document.createElement("style");
style.textContent = `
  /* Menu icon — large, responsive, corner-locked */
  .menu-icon {
    position: fixed;
    top: 12px;
    right: 12px;
    width: clamp(60px, 10vw, 110px);
    height: auto;
    cursor: pointer;
    z-index: 1000;
  }

  /* Extra large desktop screens */
  @media (min-width: 1500px) {
    .menu-icon {
      width: 110px;
      top: 16px;
      right: 16px;
    }
  }

  /* Dropdown panel */
  .menu-panel {
    position: fixed;
    top: 140px;
    right: 16px;
    background: white;
    border: 2px solid black;
    padding: 15px;
    border-radius: 12px;
    min-width: 180px;
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


// Load menu behavior
import("/js/menu.js");