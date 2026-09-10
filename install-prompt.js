(() => {
  const prompt = document.querySelector("#mobile-install-prompt");
  if (!prompt) return;
  const isAndroidPhone = /Android/i.test(navigator.userAgent)
    && window.matchMedia("(max-width: 820px)").matches
    && !window.matchMedia("(display-mode: standalone)").matches;
  if (!isAndroidPhone || sessionStorage.getItem("clothmatics-install-prompt") === "seen") return;

  const dismiss = () => {
    sessionStorage.setItem("clothmatics-install-prompt", "seen");
    prompt.classList.add("leaving");
    window.setTimeout(() => prompt.classList.add("hidden"), 220);
  };

  window.setTimeout(() => prompt.classList.remove("hidden"), 900);
  prompt.querySelectorAll("[data-install-dismiss]").forEach((button) => button.addEventListener("click", dismiss));
  prompt.querySelector("[data-install-open]")?.addEventListener("click", dismiss);
})();
