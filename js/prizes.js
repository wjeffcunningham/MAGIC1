document.addEventListener("DOMContentLoaded", () => {

  // PRIZE ROTATION
  const prizeImg = document.getElementById("prize-img");

  const prizes = [
    "./assets/Legends_booster2.webp",
    "./assets/card_reb.jpg",
    "./assets/card_surv.jpg",
    "./assets/card_etdr.webp"
  ];

  let idx = 0;

  prizeImg.addEventListener("click", () => {
    idx = (idx + 1) % prizes.length;
    prizeImg.src = prizes[idx];
  });

  // LIGHTBOX
  const lightbox = document.getElementById("card-lightbox");
  const lbImg = lightbox.querySelector("img");

  document.querySelectorAll(".logos img, #prize-img").forEach(img => {
    img.addEventListener("click", () => {
      lbImg.src = img.src;
      lightbox.style.display = "flex";
    });
  });

  lightbox.addEventListener("click", () => {
    lightbox.style.display = "none";
    lbImg.src = "";
  });

  // POSTER PAGING
  const posters = document.querySelectorAll(".poster");
  const arrow = document.getElementById("poster-arrow");
  let posterIndex = 0;

  arrow.addEventListener("click", () => {
    posterIndex = (posterIndex + 1) % posters.length;
    posters.forEach((p, i) => p.classList.toggle("active", i === posterIndex));
  });

});