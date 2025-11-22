document.addEventListener("DOMContentLoaded", () => {

  // Inject menu icon + panel
  const html = `
    <img src="/assets/magic1.svg" id="menu-icon" class="menu-icon" />
    <div id="menu-panel" class="menu-panel"></div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);

  // CSS
  const style = document.createElement("style");
  style.textContent = `
    .menu-icon {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 64px;
      height: 64px;
      cursor: pointer;
      z-index: 5000;
      user-select: none;
      opacity: 0.97;
    }

    @media(max-width:600px){
      .menu-icon{
        width:64px;
        height:64px;
      }
    }

    #menu-panel {
      position: fixed;
      top: 96px;
      right: 20px;
      width: 220px;
      background: white;
      border: 2px solid black;
      padding: 14px;
      border-radius: 12px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.15);
      display: none;
      z-index: 4999;

      opacity: 0;
      transform: translateY(-6px);
      transition: opacity .2s ease, transform .2s ease;
    }

    #menu-panel.open {
      display: block;
      opacity: 1;
      transform: translateY(0);
    }

    .menu-link {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      font-size: 0.92rem;
      text-decoration: none;
      color: black;

      position: relative;
      overflow: hidden;
    }

    .menu-link:hover { text-decoration: underline; }
    .menu-link.active { font-weight: 600; text-decoration: underline; }

    .menu-group-title {
      font-weight: 600;
      margin: 10px 0 4px;
      font-size: 0.9rem;
      border-bottom: 1px solid #eee;
      padding-bottom: 3px;
    }
  `;
  document.head.appendChild(style);

  // Load behavior after layout is stable
  requestAnimationFrame(() => {
    setTimeout(() => import("/js/menu.js"), 0);
  });

});