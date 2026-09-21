// scripts/resolve-mr.mjs — tìm MR từ field Jira, fallback quét link trong description.
const MR_RE = /https?:\/\/gitlab\.com\/([^\s)"']+?)\/-\/merge_requests\/(\d+)/i;

function extractUrl(raw) {
  if (!raw) return null;
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const m = s.match(MR_RE);
  return m ? { projectPath: m[1], mrIid: m[2], webUrl: m[0] } : null;
}

const rawInput = await new Promise((r) => {
  let d = ''; process.stdin.on('data', (c) => (d += c)); process.stdin.on('end', () => r(d));
});
let input;
try { input = JSON.parse(rawInput); }
catch { console.log(JSON.stringify({ found: false, reason: 'no_input' })); process.exit(0); }

let hit = extractUrl(input.mergeRequestRaw);
let reason = hit ? 'field' : null;
if (!hit) { hit = extractUrl(input.description); reason = hit ? 'description' : 'not_found'; }

console.log(JSON.stringify(hit ? { found: true, ...hit, reason } : { found: false, reason }));
