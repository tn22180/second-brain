import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY = join(HERE, '..', '..', 'references', 'apps.json');

export function loadRegistry(path = REGISTRY) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function expandHome(p) {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

/** `[BUG][APC] ...` → `APC`. Tag ở cặp `[]` THỨ HAI theo naming Solar `[ROLE][App]`. */
export function tagFromSummary(summary) {
  const m = String(summary || '').match(/^\s*\[[^\]]+\]\s*\[([^\]]+)\]/);
  return m ? m[1].trim().toUpperCase() : undefined;
}

/**
 * Field Falcon App là nguồn chính, tag trong summary là nguồn phụ.
 *
 * Hai nguồn mâu thuẫn thì KHÔNG tự chọn bên nào: một ticket gắn sai board vẫn còn cứu được,
 * một MR mở nhầm repo thì không. Trả về `conflict` để caller dừng và hỏi người.
 *
 * App có trong `outOfScope` được phân biệt với app lạ hoàn toàn — thông điệp khác nhau quyết
 * định việc tiếp theo là "thêm repo vào registry" hay "đọc lại ticket".
 */
export function resolveApp(issueFields, registry = loadRegistry()) {
  const falconApp = issueFields?.customfield_11203?.value;
  const tag = tagFromSummary(issueFields?.summary);

  const byField = registry.apps.find(a => a.falconApp === falconApp);
  const byTag = registry.apps.find(a => a.tag === tag);

  if (byField && byTag && byField.repo !== byTag.repo) {
    return {
      ok: false,
      reason: 'conflict',
      detail: `Falcon App = "${falconApp}" (${byField.repo}) nhưng summary gắn tag [${tag}] (${byTag.repo})`
    };
  }
  const app = byField || byTag;
  if (!app) {
    const known = falconApp && registry.outOfScope[falconApp];
    return {
      ok: false,
      reason: known ? 'out_of_scope' : 'unknown',
      detail: known
        ? `Falcon App "${falconApp}": ${known}. Thêm vào references/apps.json trước khi chạy.`
        : `không xác định được app — Falcon App = ${JSON.stringify(falconApp)}, tag summary = ${JSON.stringify(tag)}`
    };
  }
  return {
    ok: true,
    app: {...app, repoPath: join(registry.reposRoot, app.repo)},
    source: byField ? 'falconApp' : 'summaryTag'
  };
}

/** Slug đi thẳng vào tên ref và tên thư mục, nên siết ở đây một lần cho cả hai. */
export function slugify(slug) {
  return (
    String(slug || 'fix')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'fix'
  );
}

/** `fix/FAL-720-swagger-token-auth`. */
export function branchName(issueKey, slug) {
  return `fix/${issueKey}-${slugify(slug)}`;
}

/**
 * Worktree nằm NGOÀI mọi repo: một worktree là checkout đầy đủ, đặt trong repo thì jest gom
 * test hai lần (seo đã phải thêm testPathIgnorePatterns vì đúng lỗi này).
 */
export function worktreeDir(registry, issueKey, slug) {
  return join(expandHome(registry.worktreeRoot), `${issueKey}-${slugify(slug)}`);
}
