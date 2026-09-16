#!/usr/bin/env node
/*
 * Tag Crisp conversations of Shopify-staff stores with segment `no-ai` so CS AI skips them.
 *
 *   node backfill.mjs                 dry-run: list matching shops + conversations
 *   node backfill.mjs --apply         write segment to conversations
 *   node backfill.mjs --apply --only-domain=foo.myshopify.com   apply to one store first
 *
 * Staff store = shops.email ends with @shopify.com / @shopifyemail.com (Firestore REST, ADC token).
 * Crisp website is shared by seo/blogs/apc/llm/aio — one `no-ai` tag covers a store across apps.
 * Cred: ${SECRETS_DIR:-~/Documents/secrets}/crisp.config.json {identifier, key, website_id}.
 * Joy is out of scope (separate Crisp website).
 */
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const TAG = 'no-ai';
const STAFF_EMAIL_RE = /@(shopify|shopifyemail)\.com$/i;
const PROJECTS = ['avada-seo', 'avada-blog-app', 'ai-product-copy', 'seo-on-aeo', 'app-plaza-image-optimizer'];

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const onlyArg = argv.find(a => a.startsWith('--only-domain='));
const ONLY_DOMAIN = onlyArg ? onlyArg.split('=')[1].toLowerCase() : null;

const SEC_DIR = process.env.SECRETS_DIR || join(process.env.HOME, 'Documents', 'secrets');
const crisp = JSON.parse(readFileSync(join(SEC_DIR, 'crisp.config.json'), 'utf8'));
const WID = crisp.website_id;
const AUTH = 'Basic ' + Buffer.from(`${crisp.identifier}:${crisp.key}`).toString('base64');
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const normalizeDomain = url =>
  String(url || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
const field = (fields, name) => fields?.[name]?.stringValue || '';

let gcloudToken = null;
const firestoreToken = () => {
  if (!gcloudToken) {
    // ADC on this machine points at a missing SA file (~/.openclaw/firebase-sa.json); fall back to the user login
    try {
      gcloudToken = execSync('gcloud auth application-default print-access-token', {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
    } catch {
      gcloudToken = execSync('gcloud auth print-access-token', {encoding: 'utf8'}).trim();
    }
  }
  return gcloudToken;
};

async function http(method, url, {headers = {}, body} = {}) {
  const res = await fetch(url, {method, headers, body: body ? JSON.stringify(body) : undefined});
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return {status: res.status, json};
}

async function* streamShops(projectId) {
  let pageToken;
  do {
    const url =
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/shops?pageSize=1000` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const {status, json} = await http('GET', url, {headers: {Authorization: `Bearer ${firestoreToken()}`}});
    if (status === 401 || status === 403) {
      gcloudToken = null; // token may have expired mid-stream; retry once via new token
      const retry = await http('GET', url, {headers: {Authorization: `Bearer ${firestoreToken()}`}});
      if (retry.status >= 400) throw new Error(`firestore ${projectId} HTTP ${retry.status}: ${JSON.stringify(retry.json).slice(0, 200)}`);
      pageToken = retry.json.nextPageToken;
      for (const doc of retry.json.documents || []) yield {projectId, doc};
      continue;
    }
    if (status >= 400) throw new Error(`firestore ${projectId} HTTP ${status}: ${JSON.stringify(json).slice(0, 200)}`);
    for (const doc of json.documents || []) yield {projectId, doc};
    pageToken = json.nextPageToken;
  } while (pageToken);
}

const crispGet = path => http('GET', `https://api.crisp.chat/v1${path}`, {headers: {Authorization: AUTH, 'X-Crisp-Tier': 'plugin'}});
const crispPatch = (path, body) =>
  http('PATCH', `https://api.crisp.chat/v1${path}`, {
    headers: {Authorization: AUTH, 'X-Crisp-Tier': 'plugin', 'Content-Type': 'application/json'},
    body
  });

async function findConversations(domain) {
  const found = [];
  for (let page = 1; page <= 10; page++) {
    const {status, json} = await crispGet(
      `/website/${WID}/conversations/${page}?per_page=40&search_type=text&search_query=${encodeURIComponent(domain)}`
    );
    if (status >= 400) throw new Error(`crisp search ${domain} HTTP ${status}`);
    const convs = (json && json.data) || [];
    if (!convs.length) break;
    // Shared website: text search can surface other stores' chats — match on the url meta, any app segment
    for (const conv of convs) {
      if (normalizeDomain(conv?.meta?.data?.url) !== domain) continue;
      found.push({sessionId: conv.session_id, segments: conv?.meta?.segments || []});
    }
    if (convs.length < 40) break;
  }
  return found;
}

async function tagConversation(conv) {
  if (conv.segments.includes(TAG)) return {sessionId: conv.sessionId, action: 'already-tagged'};
  // PATCH meta merges — send segments only, nickname/email/data untouched
  const {status, json} = await crispPatch(`/website/${WID}/conversation/${conv.sessionId}/meta`, {segments: [...conv.segments, TAG]});
  if (status >= 400) return {sessionId: conv.sessionId, action: `error HTTP ${status}: ${JSON.stringify(json).slice(0, 150)}`};
  return {sessionId: conv.sessionId, action: 'tagged'};
}

(async () => {
  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${ONLY_DOMAIN ? ` (only ${ONLY_DOMAIN})` : ''}  tag: ${TAG}  website: ${WID}`);

  // 1. staff stores from Firestore shops
  const shops = [];
  let staffPlanOnly = 0;
  for (const projectId of PROJECTS) {
    let total = 0;
    for await (const {doc} of streamShops(projectId)) {
      total++;
      const f = doc.fields || {};
      const email = field(f, 'email');
      const domain = normalizeDomain(field(f, 'shopifyDomain') || field(f, 'domain'));
      if (STAFF_EMAIL_RE.test(email)) {
        if (domain) shops.push({projectId, domain, email, plan: field(f, 'shopifyPlanName')});
      } else if (field(f, 'shopifyPlanName') === 'staff') staffPlanOnly++;
    }
    console.log(`${projectId}: scanned ${total} shops, ${shops.length} staff matches so far`);
  }
  if (staffPlanOnly) console.log(`note: ${staffPlanOnly} shops have plan=staff but non-@shopify email — NOT tagged (email rule only)`);

  // 2. dedup domains, optional single-store gate
  const byDomain = new Map();
  for (const s of shops) if (!byDomain.has(s.domain)) byDomain.set(s.domain, s);
  let targets = [...byDomain.values()];
  if (ONLY_DOMAIN) {
    targets = targets.filter(s => s.domain === ONLY_DOMAIN);
    if (!targets.length) {
      console.log(`no staff store with domain ${ONLY_DOMAIN} — check Firestore first`);
      process.exit(1);
    }
  }
  console.log(`unique staff domains: ${targets.length}`);

  // 3. find + tag conversations
  const rows = ['project,domain,email,plan,session_id,action'];
  let tagged = 0;
  for (const shop of targets) {
    const convs = await findConversations(shop.domain);
    console.log(`${shop.domain} (${shop.email}) — ${convs.length} conversations`);
    if (!convs.length) rows.push([shop.projectId, shop.domain, shop.email, shop.plan, '', 'no-conversation'].join(','));
    for (const conv of convs) {
      const result = APPLY ? await tagConversation(conv) : {sessionId: conv.sessionId, action: conv.segments.includes(TAG) ? 'already-tagged' : 'would-tag'};
      if (APPLY) await sleep(300); // Crisp rate limit
      if (result.action === 'tagged') tagged++;
      rows.push([shop.projectId, shop.domain, shop.email, shop.plan, result.sessionId, result.action].join(','));
    }
  }

  mkdirSync(OUT_DIR, {recursive: true});
  const csv = join(OUT_DIR, `no-ai-${new Date().toISOString().slice(0, 10)}${APPLY ? '-applied' : '-dryrun'}.csv`);
  writeFileSync(csv, rows.join('\n') + '\n');
  console.log(`tagged ${tagged} conversations. csv: ${csv}`);
})().catch(e => {
  console.error('✗', e.message);
  process.exit(1);
});
