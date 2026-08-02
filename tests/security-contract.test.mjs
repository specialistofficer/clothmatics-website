import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root=new URL("../",import.meta.url);
test("ordinary web users have no AI endpoint or user-facing AI route",async()=>{
  const app=await readFile(new URL("app.js",root),"utf8");
  const html=await readFile(new URL("index.html",root),"utf8");
  assert.doesNotMatch(app,/\/api\/(generate-outfit|smart-purchase)/);
  assert.doesNotMatch(app,/Festival Stylist|panel-stylist|isTrustedPremiumClient/);
  assert.doesNotMatch(html,/data-panel="(?:stylist|festival)"|panel-stylist/);
  assert.match(html,/<symbol id="icon-bag"/);
  assert.match(html,/data-panel="purchase"[\s\S]*?href="#icon-bag"/);
  await assert.rejects(access(new URL("functions/api/generate-outfit.js",root)));
  await assert.rejects(access(new URL("functions/api/smart-purchase.js",root)));
});
test("admin AI drafting is claim-gated and delivery remains explicit",async()=>{
  const admin=await readFile(new URL("admin.js",root),"utf8");
  const endpoint=await readFile(new URL("functions/api/admin/push-draft.js",root),"utf8");
  assert.match(admin,/token\.claims\.admin !== true/);assert.match(admin,/httpsCallable\(functions, "deletePushCampaign"\)/);
  assert.match(admin,/maxlength="55"/);assert.match(admin,/maxlength="140"/);assert.match(admin,/estimatePushCampaignReach/);
  assert.match(endpoint,/hasAdminClaim\(identity\)/);assert.match(endpoint,/GATEWAY_URL/);assert.doesNotMatch(endpoint,/pushCampaigns|setDoc|addDoc/);
  assert.doesNotMatch(admin,/deleteDoc\(doc\(db,"pushCampaigns"/);
});
test("admin operational controls reuse server-enforced mobile contracts",async()=>{
  const admin=await readFile(new URL("admin.js",root),"utf8");
  const html=await readFile(new URL("admin.html",root),"utf8");
  assert.match(admin,/httpsCallable\(functions, "setUserSecurityControls"\)/);
  assert.match(admin,/doc\(db, "appConfig", "aiControls"\)/);
  assert.match(admin,/data-toggle-coupon/);
  assert.match(admin,/deleteDoc\(doc\(db, "coupons", code\)\)/);
  assert.match(admin,/knownUserIds\.has\(userId\)/);
  assert.match(html,/href="#push-campaigns">[\s\S]*?<span>Push notifications<\/span>/);
  assert.match(html,/id="kill-all-ai"/);
  assert.match(html,/id="detail-ai-limit"/);
  assert.match(html,/id="toggle-user-login"/);
});
test("public deletion form calls the authenticated deletion callable",async()=>{
  const html=await readFile(new URL("contact.html",root),"utf8");
  const contact=await readFile(new URL("contact.js",root),"utf8");
  assert.match(html,/id="delete-account"/);assert.match(html,/id="deletion-signin-form"/);
  assert.match(contact,/httpsCallable\([^\n]+"requestAccountDeletion"\)/);
  assert.doesNotMatch(html,/mailto:clothmatics@gmail\.com/);
});
test("ordinary website does not directly write share analytics",async()=>{
  const app=await readFile(new URL("app.js",root),"utf8");
  assert.match(app,/httpsCallable\(firebaseFunctions, "logShareEvent"\)/);
  assert.doesNotMatch(app,/addDoc\(collection\(db,"shareAttribution"/);
});
