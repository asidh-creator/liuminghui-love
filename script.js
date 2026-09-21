const revealItems = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.13 }
);

revealItems.forEach((item) => observer.observe(item));

const loveButton = document.getElementById("loveButton");
const loveReply = document.getElementById("loveReply");

function celebrate() {
  const count = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 30;

  for (let index = 0; index < count; index += 1) {
    const heart = document.createElement("span");
    heart.className = "celebration";
    heart.textContent = index % 4 === 0 ? "✦" : "♥";
    heart.style.setProperty("--x", `${8 + Math.random() * 84}%`);
    heart.style.setProperty("--size", `${0.75 + Math.random() * 1.25}rem`);
    heart.style.setProperty("--duration", `${3.3 + Math.random() * 2.2}s`);
    heart.style.setProperty("--drift", `${-70 + Math.random() * 140}px`);
    heart.style.setProperty("--spin", `${-80 + Math.random() * 160}deg`);
    heart.style.animationDelay = `${Math.random() * 0.7}s`;
    document.body.appendChild(heart);
    window.setTimeout(() => heart.remove(), 6500);
  }
}

loveButton.addEventListener("click", () => {
  loveReply.classList.add("is-visible");
  loveButton.innerHTML = "这份心意，已被珍藏 <span aria-hidden=\"true\">♥</span>";
  loveButton.disabled = true;
  celebrate();
});
