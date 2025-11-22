// Inject menu icon + panel
const html = `
  <img src="/assets/magic1.svg" id="menu-icon" class="menu-icon" data-preload="jan2026" />
  <div id="menu-panel" class="menu-panel"></div>
`;

document.body.insertAdjacentHTML("beforeend", html);

// Inject CSS globally
const style = document.createElement("style");
style.textContent = `
  /* Icon — now HARD-PINNED + larger bias */
  .menu-icon {
    position: fixed;
    top: 16px;
    right: 16px;
    width: min(15vw, 110px);
    height: auto;
    cursor: pointer;
    z-index: 2000;
    user-select: none;
    opacity: 0.97;
  }

  @media (max-width: 600px) {
    .menu-icon {
      width: min(24vw, 125px);
      top: 12px;
      right: 12px;
    }
  }

  /* Menu container — pinned directly under icon, smoother motion */
  #menu-panel {
    position: fixed;
    top: calc(16px + min(15vw, 110px) + 12px); /* dynamic spacing */
    right: 16px;
    width: 240px;
    background: white;
    border: 2px solid black;
    padding: 14px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    display: none;
    z-index: 1999;

    opacity: 0;
    transform: translateY(-6px);
    transition: opacity 0.22s ease, transform 0.22s ease;
  }

  @media (max-width: 600px) {
    #menu-panel {
      top: calc(12px + min(24vw, 125px) + 8px);
      right: 10px;
      width: 75vw;
    }
  }

  #menu-panel.open {
    display: block;
    opacity: 1;
    transform: translateY(0);
  }

  /* Links */
  .menu-link {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    font-size: 0.92rem;
    text-decoration: none;
    color: black;
  }
  .menu-link:hover {
    text-decoration: underline;
  }
  .menu-link.active {
    font-weight: 600;
    text-decoration: underline;
  }

  /* SVG icons */
  .menu-link svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* Section titles */
  .menu-group-title {
    font-weight: 600;
    margin: 10px 0 4px 0;
    font-size: 0.9rem;
    color: #333;
    border-bottom: 1px solid #eee;
    padding-bottom: 3px;
  }

  /* Admin badge + user label */
  #menu-user-label {
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: #000;
  }

  #menu-user-label .admin-badge {
    background: black;
    color: white;
    padding: 2px 6px;
    border-radius: 6px;
    font-size: 0.75rem;
    margin-left: 6px;
  }
`;

document.head.appendChild(style);

// Load menu behavior
import("/js/menu.js");