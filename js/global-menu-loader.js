// Inject menu icon + panel
const html = `
  <img src="/assets/magic1.svg" id="menu-icon"
       style="position:fixed;top:20px;right:20px;width:72px;height:72px;cursor:pointer;z-index:1000;" />

  <div id="menu-panel"
       style="display:none;position:fixed;top:110px;right:20px;background:white;
              border:2px solid black;border-radius:12px;padding:15px;
              box-shadow:0 4px 10px rgba(0,0,0,0.15);z-index:999;">
  </div>
`;

document.body.insertAdjacentHTML("beforeend", html);

// Load menu logic
import("/js/menu.js");