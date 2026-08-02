import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { browserLocalPersistence, getAuth, GoogleAuthProvider, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-functions.js";
import { firebaseConfig } from "./config.js";

const $ = (selector) => document.querySelector(selector);
const message = $("#support-message");
const supportEmail = "clothmatics@gmail.com";
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const requestAccountDeletion = httpsCallable(getFunctions(firebaseApp, "us-central1"), "requestAccountDeletion");
await setPersistence(auth, browserLocalPersistence);

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
    errorBox.textContent = "Your email app could not be opened. Please try again from a device with an email application configured.";
    errorBox.classList.remove("hidden");
  }
});

onAuthStateChanged(auth, (user) => {
  $("#deletion-signed-out").classList.toggle("hidden", Boolean(user));
  $("#deletion-signed-in").classList.toggle("hidden", !user);
  $("#deletion-account-email").textContent = user?.email || "Signed-in ClothMatics account";
  if (!user) $("#deletion-confirm").checked = false;
});

$("#deletion-signin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await deletionAction(async () => signInWithEmailAndPassword(auth, $("#deletion-email").value.trim(), $("#deletion-password").value), "Account verified.");
});

$("#deletion-google").addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt:"select_account" });
  await deletionAction(() => signInWithPopup(auth, provider), "Account verified.");
});

$("#deletion-signout").addEventListener("click", () => signOut(auth));
$("#request-deletion").addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return setDeletionStatus("Sign in to the account you want deleted.", true);
  if (!$("#deletion-confirm").checked) return setDeletionStatus("Confirm that you understand the deletion is permanent.", true);
  if (!window.confirm(`Submit a permanent deletion request for ${user.email || "this account"}?`)) return;
  const button = $("#request-deletion");
  button.disabled = true;
  try {
    await requestAccountDeletion();
    setDeletionStatus("Your deletion request was submitted securely. You can return later to check with support if needed.", false);
  } catch (error) {
    setDeletionStatus(`Request could not be submitted: ${friendlyDeletionError(error)}`, true);
    button.disabled = false;
  }
});

async function deletionAction(action, successMessage) {
  try { await action(); setDeletionStatus(successMessage, false); }
  catch (error) { setDeletionStatus(friendlyDeletionError(error), true); }
}
function setDeletionStatus(text, isError) { const target=$("#deletion-status"); target.textContent=text; target.classList.toggle("error",isError); target.classList.toggle("success",!isError); }
function friendlyDeletionError(error) { const code=String(error?.code||""); if(code.includes("wrong-password")||code.includes("invalid-credential"))return "The email or password is incorrect."; if(code.includes("popup-closed"))return "Google sign-in was closed before completion."; if(code.includes("permission-denied"))return "This account is not eligible to submit the request right now."; return error?.message||"Please try again."; }
