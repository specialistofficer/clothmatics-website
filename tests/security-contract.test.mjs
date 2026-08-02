import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root=new URL("../",import.meta.url);
test("AI endpoints re-read trusted state and do not trust browser wardrobe or plan",async()=>{
  const outfit=await readFile(new URL("functions/api/generate-outfit.js",root),"utf8");
  const purchase=await readFile(new URL("functions/api/smart-purchase.js",root),"utf8");
  assert.match(outfit,/getOwnedWardrobe/);assert.doesNotMatch(outfit,/sanitizeWardrobe\(body\.wardrobe\)/);
  assert.match(purchase,/getUserProfile/);assert.match(purchase,/isPremiumProfile/);
});
test("admin campaign UI is claim-gated and deletion uses callable",async()=>{
  const admin=await readFile(new URL("admin.js",root),"utf8");
  assert.match(admin,/token\.claims\.admin !== true/);assert.match(admin,/httpsCallable\(functions, "deletePushCampaign"\)/);
  assert.doesNotMatch(admin,/deleteDoc\(doc\(db,"pushCampaigns"/);
});
test("ordinary website does not directly write share analytics",async()=>{
  const app=await readFile(new URL("app.js",root),"utf8");
  assert.match(app,/httpsCallable\(firebaseFunctions, "logShareEvent"\)/);
  assert.doesNotMatch(app,/addDoc\(collection\(db,"shareAttribution"/);
});
