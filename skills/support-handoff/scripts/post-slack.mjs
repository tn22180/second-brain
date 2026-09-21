// scripts/post-slack.mjs — reply trong thread Slack. Draft-first: không --confirm chỉ in dry-run.
import { postReply, getPermalink } from './lib/slack.mjs';

try {
  const args = process.argv.slice(2);
  const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
  const confirm = args.includes('--confirm');
  const channel = get('--channel');
  const thread = get('--thread');

  const body = await new Promise((r) => { let d = ''; process.stdin.on('data', (c) => (d += c)); process.stdin.on('end', () => r(d)); });

  if (!channel || !thread) { console.error('USAGE: --channel <C> --thread <ts> [--confirm], body qua STDIN'); process.exit(1); }
  if (!body.trim()) { console.error('EMPTY_BODY'); process.exit(1); }

  if (!confirm) {
    console.log(`[DRY-RUN] Slack reply → channel ${channel} thread ${thread}\n---\n${body}`);
    process.exit(0);
  }

  const { ts, channel: ch } = await postReply(channel, thread, body);
  let link = '';
  try { link = await getPermalink(ch, ts); } catch { /* permalink phụ, bỏ qua nếu lỗi */ }
  console.log(`POSTED Slack reply ts=${ts}${link ? `\n${link}` : ''}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
