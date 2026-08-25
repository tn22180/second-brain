import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, symlinkSync} from 'node:fs';
import {dirname, join} from 'node:path';

const DEFAULT_TIMEOUT_MS = 120_000;

export function run(argv, {cwd, timeoutMs = DEFAULT_TIMEOUT_MS} = {}) {
  return new Promise(resolve => {
    const child = spawn(argv[0], argv.slice(1), {cwd, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.on('error', err => {
      clearTimeout(timer);
      resolve({code: 127, stdout, stderr: String(err.message)});
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({code: code ?? 1, stdout, stderr});
    });
  });
}

export const git = (repoPath, args, opts) => run(['git', '-C', repoPath, ...args], opts);

/**
 * Worktree luôn cắt từ `origin/<base>` vừa fetch, không bao giờ từ HEAD của cây làm việc:
 * cây của Tuan thường đang nằm trên feature branch đi sau master hàng chục commit, và một
 * fix cắt từ đó mang theo cả những commit không liên quan vào MR.
 */
/**
 * Mở lại một branch đã có, KHÔNG reset nó về base.
 *
 * `createWorktree` cắt branch mới bằng `-B <branch> <baseSha>`, và chạy nó trên một branch đã push
 * sẽ ném đi mọi commit trên đó. Sửa tiếp một MR đang mở phải đi qua đây.
 */
export async function reopenWorktree({repoPath, branch, dir, timeoutMs}) {
  if (!existsSync(repoPath)) return {ok: false, detail: `repo không có trên đĩa: ${repoPath}`};

  const known = await git(repoPath, ['rev-parse', '--verify', branch], {timeoutMs});
  if (known.code !== 0) return {ok: false, detail: `branch ${branch} không tồn tại trong repo`};

  if (existsSync(dir)) await git(repoPath, ['worktree', 'remove', '--force', dir], {timeoutMs});
  await git(repoPath, ['worktree', 'prune'], {timeoutMs});
  mkdirSync(dirname(dir), {recursive: true});

  const added = await git(repoPath, ['worktree', 'add', dir, branch], {timeoutMs});
  if (added.code !== 0) {
    return {ok: false, detail: `git worktree add: ${(added.stderr || added.stdout).trim().slice(0, 300)}`};
  }
  const head = await git(repoPath, ['-C', dir, 'rev-parse', 'HEAD'], {timeoutMs});

  return {ok: true, dir, branch, baseSha: head.stdout.trim(), nodeModules: linkNodeModules(repoPath, dir)};
}

export async function createWorktree({repoPath, baseBranch, branch, dir, timeoutMs}) {
  if (!existsSync(repoPath)) return {ok: false, detail: `repo không có trên đĩa: ${repoPath}`};

  const fetched = await git(repoPath, ['fetch', 'origin', baseBranch, '--prune'], {timeoutMs});
  if (fetched.code !== 0) return {ok: false, detail: `git fetch: ${(fetched.stderr || fetched.stdout).trim().slice(0, 300)}`};

  const head = await git(repoPath, ['rev-parse', `origin/${baseBranch}`], {timeoutMs});
  if (head.code !== 0) return {ok: false, detail: `origin/${baseBranch} không tồn tại`};
  const baseSha = head.stdout.trim();

  if (existsSync(dir)) {
    // Lần chạy trước để lại. Gỡ đăng ký rồi tạo lại, thay vì fix tiếp lên một cây có thể
    // đang bẩn — trạng thái không rõ là thứ đắt nhất để debug về sau.
    await git(repoPath, ['worktree', 'remove', '--force', dir], {timeoutMs});
  }
  await git(repoPath, ['worktree', 'prune'], {timeoutMs});
  mkdirSync(dirname(dir), {recursive: true});

  const added = await git(repoPath, ['worktree', 'add', '-B', branch, dir, baseSha], {timeoutMs});
  if (added.code !== 0) return {ok: false, detail: `git worktree add: ${(added.stderr || added.stdout).trim().slice(0, 300)}`};

  return {ok: true, dir, branch, baseSha, nodeModules: linkNodeModules(repoPath, dir)};
}

/**
 * Nối `node_modules` của checkout gốc vào worktree bằng symlink.
 *
 * Worktree mới không mang theo `node_modules` (nó không được commit), nên jest trong đó chết ở
 * import đầu tiên. Cài lại cho mỗi worktree là vài phút và vài trăm MB mỗi lần; symlink sang cây
 * gốc cho đúng thứ CI cũng thấy, vì cả hai đọc chung một `yarn.lock`.
 *
 * Không đè lên thư mục đã có, và không bao giờ đi ngược lại: worktree chỉ đọc.
 */
export function linkNodeModules(repoPath, dir) {
  const roots = ['.'];
  const pkgDir = join(repoPath, 'packages');
  if (existsSync(pkgDir)) {
    for (const name of readdirSync(pkgDir)) roots.push(join('packages', name));
  }
  const linked = [];
  for (const rel of roots) {
    const src = join(repoPath, rel, 'node_modules');
    const dest = join(dir, rel, 'node_modules');
    if (!existsSync(src) || existsSync(dest)) continue;
    try {
      symlinkSync(src, dest, 'dir');
      linked.push(rel);
    } catch { /* cây không có thư mục đó → bỏ qua */ }
  }

  return linked;
}

export function removeWorktree(repoPath, dir, timeoutMs) {
  return git(repoPath, ['worktree', 'remove', '--force', dir], {timeoutMs});
}

/**
 * Cái cuối cùng đứng giữa một bug trong skill và một cú push vào master.
 * Mở rộng bằng cách THÊM prefix, không bao giờ bằng cách nới điều kiện.
 */
const ALLOWED_BRANCH_PREFIXES = ['fix/FAL-'];

export function branchAllowed(branch) {
  return ALLOWED_BRANCH_PREFIXES.some(p => branch.startsWith(p));
}

/**
 * git từ chối push option có xuống dòng ("fatal: push options must not have new line
 * characters") và fail TRƯỚC khi chạm remote, nên mất cả cú push. Description vì thế đi
 * trong commit body — GitLab hiển thị nó trên MR — chứ không đi qua push option.
 */
export function singleLine(value, max) {
  return String(value).replace(/\s*\r?\n\s*/g, ' ').trim().slice(0, max);
}

/**
 * Push thành công với `merge_request.create`, GitLab in:
 *   remote:   https://git.avada.net/avada/ai-product-copy/-/merge_requests/123
 * URL dạng `/-/merge_requests/new?...` là link tạo tay — nghĩa là push option KHÔNG ăn —
 * nên chỉ id dạng số mới tính là MR đã tồn tại.
 */
export function parseMrUrl(output) {
  const m = /https?:\/\/\S*?\/-\/merge_requests\/(\d+)\b/.exec(output);
  return m ? m[0].replace(/[).,;'"]+$/, '') : undefined;
}

export function parseCreateLink(output) {
  const m = /https?:\/\/\S*?\/-\/merge_requests\/new\S*/.exec(output);
  return m ? m[0].replace(/[).,;'"]+$/, '') : undefined;
}

/** `git@host:group/repo.git` và `https://host/group/repo.git` → `https://host/group/repo`. */
export function remoteToWebUrl(remote) {
  const url = String(remote).trim().replace(/\.git$/, '');
  const scp = /^[\w.-]+@([^:]+):(.+)$/.exec(url);
  if (scp) return `https://${scp[1]}/${scp[2]}`;
  const ssh = /^ssh:\/\/(?:[\w.-]+@)?([^:/]+)(?::\d+)?\/(.+)$/.exec(url);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  const https = /^https?:\/\/(?:[^@/]+@)?(.+)$/.exec(url);
  if (https) return `https://${https[1]}`;
  return undefined;
}

export function buildCreateMrUrl(webUrl, branch, baseBranch, title) {
  const q = new URLSearchParams({
    'merge_request[source_branch]': branch,
    'merge_request[target_branch]': baseBranch,
    'merge_request[title]': title
  });
  return `${webUrl}/-/merge_requests/new?${q.toString()}`;
}

/**
 * Cổng phạm vi: diff phải nằm gọn trong danh sách file đã được duyệt ở pha GATE.
 * `allow` là đường dẫn repo-relative; một file lạ xuất hiện nghĩa là agent đã đi ra ngoài
 * cái người đọc và gật đầu, và cú push bị chặn thay vì được giải thích trong MR.
 */
export function outOfScope(changed, allow) {
  const set = new Set(allow);
  return changed.filter(f => !set.has(f));
}
