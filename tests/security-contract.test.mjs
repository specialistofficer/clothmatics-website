import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root=new URL("../",import.meta.url);
const mobileRoot=process.env.CLOTHMATICS_MOBILE_ROOT ? pathToFileURL(resolve(process.env.CLOTHMATICS_MOBILE_ROOT)+"/") : new URL("../StyleMateAI/",root);

test("ordinary web AI uses the authenticated shared-quota gateway",async()=>{
  const app=await readFile(new URL("app.js",root),"utf8");
  const api=await readFile(new URL("web-api.mjs",root),"utf8");
  assert.match(app,/panel-stylist/);
  assert.match(app,/callUserAi\(state\.user/);
  assert.match(app,/\/v1\/ai\/quota\/status/);
  assert.match(api,/await user\.getIdToken/);
  assert.match(api,/\/v1\/generate/);
  assert.doesNotMatch(`${app}\n${api}`,/\/v1\/ai\/quota\/consume/);
  assert.match(api,/response\.status\s*===\s*429/);
  assert.match(api,/response\.status\s*===\s*503/);
});

test("Pages policy and AI Worker permit authenticated cross-origin calls",async()=>{
  const [headers,aiWorker]=await Promise.all([
    readFile(new URL("_headers",root),"utf8"),
    readFile(new URL("cloudflare-ai-worker/src/index.js",mobileRoot),"utf8"),
  ]);
  assert.match(headers,/https:\/\/clothmatics-core-api\.chiragsharma376\.workers\.dev/);
  assert.match(headers,/https:\/\/clothmatics-ai-gateway\.chiragsharma376\.workers\.dev/);
  assert.match(headers,/https:\/\/api\.open-meteo\.com/);
  assert.match(headers,/https:\/\/geocoding-api\.open-meteo\.com/);
  assert.match(aiWorker,/Access-Control-Allow-Origin/);
  assert.match(aiWorker,/request\.method === "OPTIONS"/);
});

test("website service defaults mirror the production mobile app",async()=>{
  const [serviceConfig,eas,cloudflare,webConfig]=await Promise.all([
    readFile(new URL("functions/_shared/service-config.mjs",root),"utf8"),
    readFile(new URL("eas.json",mobileRoot),"utf8"),
    readFile(new URL("src/config/cloudflare.ts",mobileRoot),"utf8"),
    readFile(new URL("config.js",root),"utf8"),
  ]);
  const production=JSON.parse(eas).build.production.env;
  assert.match(serviceConfig,new RegExp(production.EXPO_PUBLIC_EXTRACTION_API_URL.replaceAll(".","\\.")));
  assert.match(cloudflare,/https:\/\/clothmatics-upload-worker\.chiragsharma376\.workers\.dev/);
  assert.match(serviceConfig,/https:\/\/clothmatics-upload-worker\.chiragsharma376\.workers\.dev/);
  const publicKey=webConfig.match(/apiKey:\s*"([^"]+)"/)?.[1];
  assert.ok(publicKey);
  assert.match(serviceConfig,new RegExp(publicKey));
  assert.doesNotMatch(serviceConfig,/GEMINI_API_KEY|PRIVATE_KEY|SERVICE_ACCOUNT/);
});

test("blank user AI overrides return to the global limit",async()=>{
  const core=await readFile(new URL("cloudflare-core-worker/src/index.js",mobileRoot),"utf8");
  assert.match(core,/rawUserLimit === null \|\| rawUserLimit === undefined/);
  assert.match(core,/fieldPaths\.push\("aiDailyLimit"\)/);
  assert.doesNotMatch(core,/aiDailyLimit:\s*input\?\.aiDailyLimit === null \? null/);
});

test("web garment intake uses authenticated shared AI, Oracle and owner-scoped storage",async()=>{
  const [html,headers,app,core,garment,extractProxy,ipTransport,uploadProxy]=await Promise.all([
    readFile(new URL("index.html",root),"utf8"),
    readFile(new URL("_headers",root),"utf8"),
    readFile(new URL("app.js",root),"utf8"),
    readFile(new URL("web-core.mjs",root),"utf8"),
    readFile(new URL("garment-upload.mjs",root),"utf8"),
    readFile(new URL("functions/api/wardrobe/extract.js",root),"utf8"),
    readFile(new URL("functions/_shared/ip-https.mjs",root),"utf8"),
    readFile(new URL("functions/api/wardrobe/upload.js",root),"utf8"),
  ]);
  assert.match(html,/theme-refresh\.css\?v=20260906-ghost-toggle-2/);
  assert.match(html,/app\.js\?v=\d{8}-[\w-]+/);
  assert.match(html,/name="theme-color" content="#2D1B69"/);
  assert.match(app,/garment-upload\.mjs\?v=20260911-appearance/);
  assert.match(headers,/\/garment-upload\.mjs\s+Cache-Control: no-store/);
  assert.match(app,/type="file"/);
  assert.match(app,/panel-camera/);
  assert.match(app,/Add to Closet/);
  assert.match(app,/Style Check/);
  assert.match(app,/Choose photos from gallery/);
  assert.match(app,/id="camera-gallery-input"[^>]+multiple/);
  assert.match(app,/Auto Extract/);
  assert.match(app,/Single Garment/);
  assert.match(app,/up to 5 photos/);
  assert.doesNotMatch(app,/capture="environment"|camera-capture-input|Open Camera/);
  assert.match(app,/analyzeStyleCheck/);
  assert.match(garment,/callVisionGateway/);
  assert.match(garment,/STYLE_CHECK_PROMPT/);
  assert.match(garment,/maxOutputTokens: 8192/);
  assert.doesNotMatch(`${app}\n${garment}`,/\/v1\/ai\/quota\/consume/);
  assert.match(extractProxy,/verifyFirebaseToken/);
  assert.match(extractProxy,/\/v1\/extract/);
  assert.match(extractProxy,/portrait_region/);
  assert.match(extractProxy,/upstreamForm\.append\("mode", mode\)/);
  assert.match(extractProxy,/postMultipartToHttpsIp/);
  assert.match(ipTransport,/node:tls/);
  assert.match(ipTransport,/Authorization: Bearer \$\{token\}/);
  assert.match(uploadProxy,/users\/\$\{session\.uid\}\/wardrobe\//);
  assert.match(uploadProxy,/crypto\.randomUUID/);
  assert.match(app,/addDoc\(collection\(db,"wardrobe"\)/);
  assert.match(app,/deleteGarmentUpload/);
  assert.match(app,/imageObjectKey:upload\.objectKey/);
  assert.match(app,/openGarmentUpload\(files\[0\],\{autoProcess:true\}\)/);
  assert.match(app,/openAutoExtract\(files\)/);
  assert.match(app,/auto-extract-results/);
  assert.match(app,/\[auto-extract\] analysis_ready/);
  assert.match(app,/isGarmentExtractionReady/);
  assert.match(extractProxy,/visibleFraction/);
  assert.match(extractProxy,/extractionObstructions/);
  assert.doesNotMatch(app,/Gemini identifies|Oracle Cloud|Firebase session|Identify with Gemini/);
  assert.match(core,/safeGarmentPatch/);
  assert.doesNotMatch(core,/SAFE_GARMENT_FIELDS[^;]+(?:image|userId|subscription|loginBlocked)/s);
  assert.match(app,/\/v1\/wardrobe\/update/);
  assert.match(app,/\/v1\/wardrobe\/delete/);
  assert.match(app,/deleteGarmentWithOwnerFallback/);
  assert.match(app,/deleteDoc\(doc\(db,"wardrobe",item\.id\)\)/);
  assert.match(app,/deleteGarmentUpload\(state\.user,objectKey\)/);
  assert.match(app,/Garment deleted successfully\./);
  assert.match(app,/We couldn’t delete this garment\. Please try again\./);
  assert.doesNotMatch(app,/Garment, image and related records deleted/);
  assert.match(app,/orderBy\("receivedAt","desc"\)/);
  assert.match(app,/Date\.now\(\)-7\*86400000/);
  assert.match(app,/item\.receivedAt\|\|item\.createdAt\|\|item\.timestamp/);
  assert.match(html,/class="google-mark"/);
  assert.doesNotMatch(html,/id="auth-form"|or continue with/);
});

test("admin AI and notification mutations use claim-gated workers",async()=>{
  const admin=await readFile(new URL("admin.js",root),"utf8");
  const aiWorker=await readFile(new URL("cloudflare-ai-worker/src/index.js",mobileRoot),"utf8");
  assert.match(admin,/token\.claims\.admin !== true/);
  assert.match(admin,/\/v1\/admin\/push-draft/);
  assert.match(admin,/\/v1\/admin\/personal-outfit/);
  assert.match(admin,/\/v1\/admin\/notifications\/campaigns/);
  assert.match(admin,/\/v1\/admin\/notifications\/reach/);
  assert.match(admin,/\/v1\/admin\/notifications\/personal-outfit/);
  assert.doesNotMatch(admin,/httpsCallable|setDoc\([^\n]*pushCampaigns/);
  assert.match(aiWorker,/identity\.claims\.admin !== true/);
});

test("personal outfit campaigns preserve context, collage, exact outfit and progress",async()=>{
  const admin=await readFile(new URL("admin.js",root),"utf8");
  const core=await readFile(new URL("cloudflare-core-worker/src/notifications.js",mobileRoot),"utf8");
  assert.match(admin,/outfitContext:context/);
  assert.match(admin,/createOutfitCollage/);
  assert.match(admin,/urls\.length<3/);
  assert.match(admin,/generated \$\{generated\}.*skipped \$\{skipped\}.*failed \$\{failed\}/s);
  assert.match(core,/replace\(\/\\\{outfit\\\}\/gi, outfit\.title\)/);
  assert.match(core,/meta\/todayOutfit/);
  assert.match(core,/route: "GeneratedOutfit"/);
});

test("admin operational controls call protected Core routes",async()=>{
  const admin=await readFile(new URL("admin.js",root),"utf8");
  const html=await readFile(new URL("admin.html",root),"utf8");
  assert.match(admin,/\/v1\/admin\/users\/security/);
  assert.match(admin,/\/v1\/admin\/account-deletion\/review/);
  assert.match(admin,/doc\(db, "appConfig", "aiControls"\)/);
  assert.match(admin,/data-toggle-coupon/);
  assert.doesNotMatch(html,/value="yearly"/);
  assert.match(html,/id="kill-all-ai"/);
  assert.match(html,/id="detail-ai-limit"/);
  assert.match(html,/id="toggle-user-login"/);
});

test("public deletion form stays authenticated and share analytics use Core",async()=>{
  const html=await readFile(new URL("contact.html",root),"utf8");
  const contact=await readFile(new URL("contact.js",root),"utf8");
  const app=await readFile(new URL("app.js",root),"utf8");
  assert.match(html,/id="delete-account"/);
  assert.match(contact,/requestAccountDeletion/);
  assert.doesNotMatch(html,/mailto:clothmatics@gmail\.com/);
  assert.match(app,/\/v1\/share\/create/);
  assert.match(app,/\/v1\/share\/log/);
  assert.doesNotMatch(app,/addDoc\(collection\(db,"shareAttribution"/);
});

