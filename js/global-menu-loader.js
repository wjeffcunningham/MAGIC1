// Inject menu icon + panel
const html = `
  <img src="/assets/magic1.svg" id="menu-icon" class="menu-icon" />

  <div id="menu-panel" class="menu-panel" style="display:none;"></div>
`;

document.body.insertAdjacentHTML("beforeend", html);
// Inject CSS for icon + menu panel globally
const style = document.createElement("style");
style.textContent = `
  .menu-icon {
    position: fixed;
    top: 20px;
    right: 20px;
    width: min(14vw, 90px);
    height: auto;
    cursor: pointer;
    z-index: 1000;
  }

  @media (max-width: 600px) {
    .menu-icon {
      width: min(18vw, 100px);
    }
  }

  .menu-panel {
    position: fixed;
    top: 110px;
    right: 20px;
    background: white;
    border: 2px solid black;
    padding: 15px;
    border-radius: 12px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.15);
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