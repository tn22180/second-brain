// scripts/resolve-mr.mjs
const MR_RE = /https?:\/\/gitlab\.com\/([^\s)"']+?)\/-\/merge_requests\/(\d+)/i;

function extractUrl(raw) {
  if (!raw) return null;
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const m = s.match(MR_RE);
  return m ? { projectPath: m[1], mrIid: m[2], webUrl: m[0] } : null;
}

const input = JSON.parse(await new Promise(r => {
  let d = ''; process.stdin.on('data', c => d += c); process.stdin.on('end', () => r(d));
}));

let hit = extractUrl(input.mergeRequestRaw);
let reason = hit ? 'field' : null;
if (!hit) { hit = extractUrl(input.description); reason = hit ? 'description' : 'not_found'; }

console.log(JSON.stringify(
  hit ? { found: true, ...hit, reason } : { found: false, reason }
));
