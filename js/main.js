/* ==========================================
   ClothMatics AI - main.js
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {

  // Loader
  const loader = document.getElementById("loader");
  if (loader) {
    window.addEventListener("load", () => {
      loader.style.opacity = "0";
      loader.style.pointerEvents = "none";
      setTimeout(() => loader.remove(), 500);
    });
  }

  // Smooth scrolling
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener("click", function(e) {
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });

  // FAQ accordion
  document.querySelectorAll(".faq-item").forEach(item => {
    const q = item.querySelector(".faq-question");
    q?.addEventListener("click", () => {
      item.classList.toggle("active");
      const ans = item.querySelector(".faq-answer");
      if (ans) {
        ans.style.display = ans.style.display === "block" ? "none" : "block";
      }
    });
  });

  // Mobile menu
  const menuBtn = document.querySelector(".menu-btn");
  const nav = document.querySelector(".nav-links");

  menuBtn?.addEventListener("click", () => {
    nav?.classList.toggle("open");
  });

  // Scroll progress
  const progress = document.querySelector(".scroll-progress");

  window.addEventListener("scroll", () => {
    const h = document.documentElement;
    const total = h.scrollHeight - h.clientHeight;
    const pct = (window.scrollY / total) * 100;
    if (progress) progress.style.width = pct + "%";
  });

  // Back to top
  const topBtn = document.getElementById("backToTop");

  window.addEventListener("scroll", () => {
    if (!topBtn) return;
    topBtn.style.display = window.scrollY > 500 ? "block" : "none";
  });

  topBtn?.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });

  // Active nav link
  const sections = document.querySelectorAll("section[id]");
  const links = document.querySelectorAll(".nav-links a");

  window.addEventListener("scroll", () => {
    let current = "";

    sections.forEach(section => {
      const top = section.offsetTop - 120;
      if (window.scrollY >= top) {
        current = section.id;
      }
    });

    links.forEach(link => {
      link.classList.remove("active");
      const href = link.getAttribute("href");
      if (href === "#" + current) {
        link.classList.add("active");
      }
    });
  });

  // Reveal animation
  const reveal = () => {
    document.querySelectorAll(".reveal").forEach(el => {
      const top = el.getBoundingClientRect().top;
      if (top < window.innerHeight - 80) {
        el.classList.add("active");
      }
    });
  };

  window.addEventListener("scroll", reveal);
  reveal();

});
