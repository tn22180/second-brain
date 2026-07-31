#!/usr/bin/env node
/* eslint-disable no-console */
/** Fixture tests for the comment codemod: one keep case and one remove case per rule. */

const fs = require('fs');
const os = require('os');
const path = require('path');
const codemod = require('./codemod');

codemod.setRepoRoot(process.argv[2] || '/Users/nguyentuan/Documents/second-brain/projects/Falcon/seo');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-test-'));
let pass = 0;
let fail = 0;

function check(name, source, expectRemovedLines, expectRules) {
  const file = path.join(tmp, `${name.replace(/\W+/g, '_')}.js`);
  fs.writeFileSync(file, source, 'utf8');
  const r = codemod.processFile(file);
  const removed = r.removed || 0;
  const rules = Object.keys(r.byRule || {}).sort().join(',');
  const want = (expectRules || []).sort().join(',');
  if (removed === expectRemovedLines && rules === want) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}: removed=${removed} (want ${expectRemovedLines}) rules=${rules || '-'} (want ${want || '-'}) ${r.skipped || ''}`);
  }
}

console.log('R1 commented-out code');
check('R1 removes a commented-out block', `
function run(shop) {
  const a = 1;
  // const legacy = buildLegacy(shop);
  // if (legacy) {
  //   return legacy;
  // }
  return a;
}
`, 4, ['R1']);

check('R1 keeps prose that is not code', `
function run(shop) {
  // Shops installed before the migration keep the old plan mapping.
  return shop;
}
`, 0, []);

check('R1 keeps a single bare identifier comment', `
function run() {
  // done
  return 1;
}
`, 0, []);

check('R1 keeps commented code carrying a WHY marker', `
function run(shop) {
  // NOTE: kept for rollback
  // const legacy = buildLegacy(shop);
  return shop;
}
`, 0, []);

check('R1 takes a block split by a blank line as one unit, blank included', `
async function run(shop) {
  // const success = await upsertMetafields({
  //   shopGid,
  //   bundleData
  // });

  // if (success) {
  //   return bundleData;
  // }
  return shop;
}
`, 8, ['R1']);

check('R1 leaves a run alone when a code-shaped comment survives beside it', `
function run(items) {
  // const batches = [];
  for (const item of items) {
    // batches.push(
    //   process(item)
    // );
    // Do not run in parallel to avoid rate limits
    process(item);
  }
}
`, 0, []);

check('R1 keeps a run whose declared name a distant comment still uses', `
function run(items) {
  // const exceedsBulkLimit = items.length > 50;
  return [
    {
      content: 'Bulk AI Fix',
      // disabled: exceedsBulkLimit,
      onAction: () => items
    }
  ];
}
`, 0, []);

check('R1 keeps a run a surviving JSX comment still references', `
export default function Banner() {
  // const handleBook = () => {
  //   window.open(PLAN_BOOK_DEMO_URL);
  // };
  return (
    <div>
      {/* <Button onClick={handleBook}>Book</Button> */}
    </div>
  );
}
`, 0, []);

check('R1 keeps a use whose commented import survives', `
// import {syncShopCreate} from '@avada/crm-sql';
export async function onCreateShop(shopSnap) {
  await Promise.all([
    // syncShopCreate({shopSnap, appId: 'seoSuite'}),
    doThing(shopSnap)
  ]);
}
`, 0, []);

check('R1 removes commented-out JSX even when it carries a URL', `
const Icon = () => <span />;

// const ProIcon = () => (
//   <svg width="74" viewBox="0 0 74 74" xmlns="http://www.w3.org/2000/svg">
//     <circle cx="37" cy="37" r="37" fill="#F0F0F8" />
//   </svg>
// );
export default Icon;
`, 5, ['R1']);

check('R1 removes a commented-out function carrying its own JSDoc', `
const keep = 1;

// /**
//  * @param {Shopify} shopify
//  * @returns {Promise<void>}
//  */
// async function checkIfProDowngraded({shopify}) {
//   const charges = await shopify.recurringApplicationCharge.list();
//   return charges;
// }
export default keep;
`, 8, ['R1']);

check('a URL still protects real prose', `
function run() {
  // Rate limits are documented at https://shopify.dev/docs/api/usage/limits
  // and the cost of a query is returned in extensions.cost
  return 1;
}
`, 0, []);

check('R1 leaves one blank line, not two, when a block sat between them', `
const before = 1;

// const dead = buildDead();
// return dead;

export default before;
`, 3, ['R1']);

console.log('R2 banners');
check('R2 removes separator banners', `
// ==========================
const a = 1;
// --------------------------
const b = 2;
`, 2, ['R2']);

check('R2 keeps a short dash that is not a banner', `
// --
const a = 1;
`, 0, []);

console.log('R3 step numbering');
check('R3 removes a step comment restating the next line', `
async function run(shop) {
  // Step 1: fetch shop settings
  const shopSettings = await fetchShopSettings(shop);
  return shopSettings;
}
`, 1, ['R3']);

check('R3 keeps a step comment that adds information', `
async function run(shop) {
  // Step 1: Shopify rejects more than 250 ids per call
  const shopSettings = await fetchShopSettings(shop);
  return shopSettings;
}
`, 0, []);

console.log('R4 restatement');
check('R4 removes a comment restating the next line', `
function run() {
  // Get shop
  const shop = getShop();
  return shop;
}
`, 1, ['R4']);

check('R4 keeps a comment naming something absent from the code', `
function run() {
  // Falls back to the cached copy
  const shop = getShop();
  return shop;
}
`, 0, []);

console.log('protections');
check('keeps eslint directives', `
// eslint-disable-next-line no-console
console.log(1);
`, 0, []);

check('keeps url comments', `
// https://shopify.dev/docs/api
const a = 1;
`, 0, []);

check('keeps vietnamese comments', `
function run() {
  // Lấy shop từ cache
  const shop = getShop();
  return shop;
}
`, 0, []);

check('keeps jsdoc blocks untouched', `
/**
 * Get the shop.
 * @param {string} id
 */
function getShop(id) {
  return id;
}
`, 0, []);

check('keeps a comment that is the whole body of a block', `
function run() {
  try {
    doThing();
  } catch (e) {
    // const ignored = e;
  }
}
`, 0, []);

check('keeps trailing comments on code lines', `
const a = 1; // Get shop
const shop = getShop();
`, 0, []);

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, {recursive: true, force: true});
process.exit(fail ? 1 : 0);
