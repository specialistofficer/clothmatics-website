const $ = (selector) => document.querySelector(selector);
const message = $("#support-message");
const supportEmail = "clothmatics@gmail.com";

message.addEventListener("input", () => {
  $("#message-count").textContent = message.value.length;
});

$("#support-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const errorBox = $("#support-error");
  errorBox.classList.add("hidden");
  try {
    const category = $("#support-category").value;
    const subject = `[${category}] ${$("#support-subject").value.trim()}`;
    const body = [
      `Name: ${$("#support-name").value.trim()}`,
      `Reply email: ${$("#support-email").value.trim()}`,
      `Category: ${category}`,
      `Platform: ${$("#support-platform").value || "Not specified"}`,
      `App version: ${$("#support-version").value.trim() || "Not specified"}`,
      `Account UID: ${$("#support-uid").value.trim() || "Not provided"}`,
      "",
      "Issue details:",
      message.value.trim(),
    ].join("\n");
    window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  } catch {
    errorBox.textContent = "Your email app could not be opened. Use the direct support email link below.";
    errorBox.classList.remove("hidden");
  }
});
