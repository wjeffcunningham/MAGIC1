// /js/global-menu-loader.js
document.addEventListener("DOMContentLoaded", () => {
  // Prevent duplication if menu already exists
  if (document.getElementById("hamburger")) return;

  const html = `
    <div id="hamburger">☰</div>
    <div id="menu-panel"></div>
  `;
  document.body.insertAdjacentHTML("beforeend", html);

  const style = document.createElement("style");
  style.textContent = `
    #hamburger {
      position: fixed;
      top: 18px;
      right: 18px;
      font-size: 2.2rem;
      font-weight: 700;
      cursor: pointer;
      z-index: 5000;
      user-select: none;
      opacity: 0.85;
      line-height: 1;
    }
    #hamburger:hover { opacity: 1; }

    #menu-panel {
      position: fixed;
      top: 70px;
      right: 18px;
      width: 240px;
      padding: 16px;

      background: #fff;
      border: 2px solid black;
      border-radius: 12px;
      box-shadow: 0 4px 10px rgba(0,0,0,.2);

      opacity: 0;
      transform: translateY(-6px);
      pointer-events: none;

      transition: opacity .2s ease, transform .2s ease;
      z-index: 4999;
    }

    #menu-panel.open {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    .menu-link {
      display: block;
      padding: 6px 0;
      text-align: left;
      text-decoration: none;
      color: #000;
      font-size: 0.95rem;
    }
    .menu-link:hover { text-decoration: underline; }

    .menu-title {
      font-weight: 700;
      margin: 10px 0 4px;
      font-size: 0.95rem;
    }
  `;
  document.head.appendChild(style);

  import("/js/menu.js");
});