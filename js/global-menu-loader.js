// Inject menu icon + panel
const html = `
  <img src="/assets/magic1.svg" id="menu-icon" class="menu-icon" />
  <div id="menu-panel" class="menu-panel"></div>
`;

document.body.insertAdjacentHTML("beforeend", html);

// Inject CSS globally
const style = document.createElement("style");
style.textContent = `
  /* Icon */
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

  /* Menu container */
  #menu-panel {
    position: fixed;
    top: 110px;
    right: 20px;
    width: 220px;
    background: white;
    border: 2px solid black;
    padding: 14px;
    border-radius: 12px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.15);
    display: none;
    z-index: 1000;

    /* slide-down animation */
    opacity: 0;
    transform: translateY(-8px);
    transition: opacity 0.2s ease, transform 0.2s ease;
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