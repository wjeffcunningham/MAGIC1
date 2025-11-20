// Inject menu icon + panel into DOM
const iconHtml = `
  <img src="/assets/magic1.svg"
       id="menu-icon"
       alt="menu"
       style="
         position: fixed;
         top: 20px;
         right: 20px;
         width: 60px;
         height: 60px;
         cursor: pointer;
         z-index: 1000;
       " />

  <div id="menu-panel"
       style="
         position: fixed;
         top: 90px;
         right: 20px;
         background: white;
         border: 2px solid black;
         padding: 15px;
         border-radius: 12px;
         box-shadow: 0 4px 12px rgba(0,0,0,0.2);
         z-index: 999;
         display: none;
       ">
  </div>
`;

document.body.insertAdjacentHTML("beforeend", iconHtml);

// Now load menu logic
import("/js/menu.js");