const input = document.querySelector("#faq-search");
const items = [...document.querySelectorAll(".faq-item")];
const groups = [...document.querySelectorAll(".faq-group")];
const empty = document.querySelector("#faq-empty");

input.addEventListener("input", () => {
  const query = input.value.trim().toLowerCase();
  items.forEach((item) => { item.hidden = Boolean(query) && !item.textContent.toLowerCase().includes(query); });
  groups.forEach((group) => { group.hidden = !group.querySelector(".faq-item:not([hidden])"); });
  empty.classList.toggle("hidden", items.some((item) => !item.hidden));
});
