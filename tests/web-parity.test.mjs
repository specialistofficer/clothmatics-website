import test from "node:test";
import assert from "node:assert/strict";
import { lookbookSlotFor, matchesGarmentSearch, shiftCalendarMonth, localDateKey, deterministicPurchaseCheck, onlyKnownIds, calculateWeeklyReport } from "../web-core.mjs";
import { PROMPT_REGISTRY, promptCacheKey, promptStamp } from "../functions/_shared/prompt-registry.mjs";

test("concrete garment words override stale roles",()=>{
  assert.equal(lookbookSlotFor({title:"Dress Shirt",bodyZone:"full_body",standaloneOutfit:true}),"top");
  assert.equal(lookbookSlotFor({title:"Bomber Jacket"}),"layer");
  assert.equal(lookbookSlotFor({title:"Silver Watch"}),"accessory");
  assert.equal(lookbookSlotFor({title:"Silk Saree"}),"hero");
  assert.equal(lookbookSlotFor({title:"Summer Dress"}),"hero");
});

test("shared search understands common synonyms",()=>{
  const shirt={title:"Cotton T-Shirt",category:"Top",brand:"North",primaryColor:"Blue"};
  assert.equal(matchesGarmentSearch(shirt,"tshirt"),true);
  assert.equal(matchesGarmentSearch(shirt,"tee blue"),true);
  assert.equal(matchesGarmentSearch({title:"Running Sneakers",category:"Footwear"},"shoes"),true);
});

test("planner shifts across years and clamps local dates",()=>{
  let result=shiftCalendarMonth(new Date(2027,0,1),"2027-01-31",1);
  assert.equal(result.selectedDate,"2027-02-28");
  result=shiftCalendarMonth(result.displayedMonth,result.selectedDate,-2);
  assert.equal(result.selectedDate,"2026-12-28");
  assert.match(localDateKey(new Date(2026,6,5,23,30)),/^2026-07-05$/);
});

test("free Smart Purchase stays deterministic and uses known IDs",()=>{
  const wardrobe=[{id:"top",category:"Top",subCategory:"T-shirt",primaryColor:"Blue"},{id:"bottom",category:"Bottom",primaryColor:"Black"},{id:"shoe",category:"Footwear",primaryColor:"White"}];
  const result=deterministicPurchaseCheck({category:"Top",subCategory:"T-shirt",primaryColor:"Blue"},wardrobe,1000);
  assert.equal(onlyKnownIds(result.outfitExamples,wardrobe),true);
  assert.ok(result.similarityMatches.every(x=>x.score>=65));
});

test("weekly report counts only the local seven-day window",()=>{
  const today=new Date(2026,7,2,12);const wardrobe=[{id:"a",category:"Top",laundryStatus:"Clean"},{id:"b",category:"Bottom",laundryStatus:"Clean"}];
  const report=calculateWeeklyReport(wardrobe,[{status:"worn",wearDate:"2026-08-02",wardrobeItemIds:["a"]},{status:"worn",wearDate:"2026-07-20",wardrobeItemIds:["b"]}],[],today);
  assert.equal(report.wornItemCount,1);assert.equal(report.outfitDays,1);
});

test("prompt registry matches active mobile identity and namespaces",()=>{
  assert.deepEqual(PROMPT_REGISTRY.outfit_stylist,{version:4,releaseTag:"wardrobe-grounded-2026-08"});
  assert.deepEqual(PROMPT_REGISTRY.smart_purchase,{version:2,releaseTag:"verified-combinations-2026-08"});
  const stamp=promptStamp("festival_stylist","private prompt fixture");
  assert.equal(stamp.promptVersion,1);assert.ok(stamp.promptHash);assert.ok(stamp.requestPromptHash);
  assert.ok(promptCacheKey("festival_stylist","user").startsWith(`${stamp.promptHash}:`));
});

