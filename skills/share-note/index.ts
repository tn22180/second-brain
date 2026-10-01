#!/usr/bin/env bun
import { readFile } from 'fs/promises'
import { resolve, extname, dirname } from 'path'
import { execSync } from 'child_process'
import * as os from 'os'
import { encryptWithKey, encryptWithPassword, generateKey, generatePassword, toBase64Url } from './private-crypto'

const CLIENT_VERSION = 'share-note@2.2.0'
const API_BASE = process.env.NOTES_API_BASE || 'https://notes.avada.net'
const NOTES_API_KEY = process.env.NOTES_API_KEY

type PrivateExpiry = '7d' | '30d' | '90d' | 'never'
type SupportedExt = 'md' | 'html'
type ChangeKind = 'content' | 'typo' | 'restructure' | 'other'

interface UpdateMeta {
  gitEmail: string
  hostname: string
  clientVersion: string
  clientType: 'cli'
  llmModel: string | null
  gitBranch: string | null
  gitCommit: string | null
  sessionId: string | null
}

interface ParsedArgs {
  filePath?: string
  updateTarget?: string
  deleteTarget?: string
  summary?: string
  kind?: ChangeKind
  private?: boolean
  expires?: string
  linkKey?: boolean
  help?: boolean
}

const HELP = `Usage:
  share-note <file>                                        Publish new note (POST)
  share-note <file> --update <url-or-id>                   Update existing note (PUT)
  share-note <file> --update <url-or-id> --summary "..."   Update with summary
  share-note <file> --update <url-or-id> --kind <kind>     Update with change kind
  share-note --delete <url-or-id>                          Delete note (DELETE, soft)

Private notes:
  share-note <file> --private                             Tạo note mã hoá đầu cuối
  share-note <file> --private --expires <7d|30d|90d|never> Hạn dùng, mặc định 30d
  share-note <file> --private --link-key                  Khoá trong URL fragment
  --expires và --link-key chỉ dùng với --private; không kèm --update / --delete.
  Private chỉ nhận .md / .html (khác: exit 2).

Change kinds: content (default) | typo | restructure | other

URL or id forms accepted by --update / --delete:
  https://notes.avada.net/PW9kjNCPTD.md
  PW9kjNCPTD                       (10-char id — ext inferred from file)
  abc...32-char-id                 (legacy 32-char id)

Env:
  NOTES_API_KEY    Required. Personal token from my.avada.net → Notes key.
  NOTES_API_BASE   Optional. Default https://notes.avada.net.

Exit codes:
  0 success | 2 bad arg | 3 file not found | 4 unsupported ext
  5 frontmatter parse | 6 upload failed | 7 update rejected | 8 missing key
  9 delete rejected
`

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') {
      out.help = true
    } else if (a === '--private') {
      out.private = true
    } else if (a === '--expires') {
      out.expires = argv[i + 1]?.startsWith('--') ? '' : (argv[++i] ?? '')
    } else if (a === '--link-key') {
      out.linkKey = true
    } else if (a === '--update') {
      out.updateTarget = argv[++i]
    } else if (a === '--delete') {
      out.deleteTarget = argv[++i]
    } else if (a === '--summary') {
      out.summary = argv[++i]
    } else if (a === '--kind') {
      out.kind = argv[++i] as ChangeKind
    } else if (!a?.startsWith('--') && out.filePath === undefined) {
      out.filePath = a
    }
  }
  return out
}

function parseFrontmatter(source: string): { title?: string; password?: string; body: string } {
  if (!source.startsWith('---')) return { body: source }
  const end = source.indexOf('\n---', 3)
  if (end === -1) return { body: source }

  const yamlBlock = source.slice(3, end).trim()
  const body = source.slice(end + 4).replace(/^\n/, '')

  const meta: Record<string, string> = {}
  for (const line of yamlBlock.split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }

  return { title: meta.title, password: meta.password, body }
}

// Parse `--update` / `--delete` value → { id, ext? }. ext is undefined if input
// was a bare id. Shared by both flags so a URL works the same way everywhere.
function parseUpdateTarget(value: string): { id: string; ext?: SupportedExt } {
  let candidate = value.trim()
  const urlMatch = candidate.match(/^https?:\/\/[^/]+\/(.+)$/)
  if (urlMatch) candidate = urlMatch[1]!
  candidate = candidate.split('?')[0]!.split('#')[0]!

  const dot = candidate.lastIndexOf('.')
  let id = candidate
  let ext: SupportedExt | undefined
  if (dot > 0) {
    const e = candidate.slice(dot + 1).toLowerCase()
    if (e === 'md' || e === 'html') {
      id = candidate.slice(0, dot)
      ext = e
    }
  }

  if (!/^[a-zA-Z0-9]{10}$/.test(id) && !/^[a-zA-Z0-9]{32}$/.test(id)) {
    throw new Error(`invalid note id "${id}" — expected 10 or 32 char base62`)
  }

  return ext ? { id, ext } : { id }
}

function safeExec(cmd: string, cwd?: string): string | null {
  try {
    const out = execSync(cmd, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
      cwd
    })
    const trimmed = out.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

async function collectMeta(filePath: string): Promise<UpdateMeta> {
  const fileDir = dirname(filePath)
  const cwd = process.cwd()

  let gitEmail = safeExec('git config user.email', cwd)
  if (!gitEmail) gitEmail = safeExec('git config user.email', fileDir)
  if (!gitEmail) {
    gitEmail = `${os.userInfo().username}@unknown`
    process.stderr.write(`warn: no git user.email found, falling back to ${gitEmail}\n`)
  }

  const gitBranch =
    safeExec('git rev-parse --abbrev-ref HEAD', cwd) ??
    safeExec('git rev-parse --abbrev-ref HEAD', fileDir)
  const gitCommit =
    safeExec('git rev-parse --short HEAD', cwd) ??
    safeExec('git rev-parse --short HEAD', fileDir)

  return {
    gitEmail,
    hostname: os.hostname(),
    clientVersion: CLIENT_VERSION,
    clientType: 'cli',
    llmModel: process.env.CLAUDE_MODEL ?? process.env.ANTHROPIC_MODEL ?? null,
    gitBranch,
    gitCommit,
    sessionId: process.env.CLAUDE_SESSION_ID ?? null
  }
}

interface UpdateResult {
  url: string
  updateSeq: number
  updateCount: number
}

interface DeleteResult {
  id: string
  deletedAt: number
}

interface ApiError {
  code: string
  message: string
  retryAfter?: number
}

// Backend shapes every failure as `{ error, message, code }` (toErrorResponse),
// so one reader serves the create, update and delete paths.
async function readApiError(res: Response): Promise<ApiError> {
  let code = 'unknown'
  let message = res.statusText
  try {
    const json = await res.json() as { error?: string; message?: string }
    code = json.error ?? 'unknown'
    message = json.message ?? message
  } catch {
    message = (await res.text().catch(() => '')) || res.statusText
  }
  const retryAfterHdr = res.headers.get('Retry-After')
  const retryAfter = retryAfterHdr ? Number(retryAfterHdr) : undefined
  return { code, message: `(${res.status}) ${message}`, retryAfter }
}

async function uploadNote(content: string, ext: SupportedExt): Promise<string | ApiError> {
  const res = await fetch(`${API_BASE}/api/upload?ext=${ext}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTES_API_KEY}`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: content,
  })

  if (!res.ok) return await readApiError(res)

  const result = await res.json() as { id: string; url: string }
  if (!result?.url || !result?.id) throw new Error('Response missing id/url fields')
  return result.url
}

async function updateNote(
  id: string,
  ext: SupportedExt,
  content: string,
  meta: UpdateMeta,
  summary: string | undefined,
  kind: ChangeKind | undefined
): Promise<UpdateResult | ApiError> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${NOTES_API_KEY}`,
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Notes-Git-Email': meta.gitEmail,
    'X-Notes-Hostname': meta.hostname,
    'X-Notes-Client': meta.clientVersion,
    'X-Notes-Client-Type': meta.clientType,
  }
  if (meta.llmModel) headers['X-Notes-LLM-Model'] = meta.llmModel
  if (meta.gitBranch) headers['X-Notes-Git-Branch'] = meta.gitBranch
  if (meta.gitCommit) headers['X-Notes-Git-Commit'] = meta.gitCommit
  if (meta.sessionId) headers['X-Notes-Session-Id'] = meta.sessionId
  if (kind) headers['X-Notes-Change-Kind'] = kind
  if (summary) headers['X-Notes-Summary'] = summary.slice(0, 500)

  const res = await fetch(`${API_BASE}/api/upload/${id}?ext=${ext}`, {
    method: 'PUT',
    headers,
    body: content,
  })

  if (!res.ok) return await readApiError(res)

  const json = await res.json() as {
    id: string
    url: string
    updateSeq: number
    updateCount: number
  }
  return { url: json.url, updateSeq: json.updateSeq, updateCount: json.updateCount }
}

// DELETE /api/upload/:id — no body, no ext. Soft delete: server sets deletedAt,
// note trả 404 ngay, blob giữ 30 ngày rồi job purge xoá hẳn.
async function deleteNote(id: string): Promise<DeleteResult | ApiError> {
  const res = await fetch(`${API_BASE}/api/upload/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${NOTES_API_KEY}` },
  })

  if (!res.ok) return await readApiError(res)

  const json = await res.json() as { id: string; deletedAt: number }
  return { id: json.id, deletedAt: json.deletedAt }
}

function isApiError<T extends object>(r: T | ApiError): r is ApiError {
  return (r as ApiError).code !== undefined
}

function friendlyApiError(err: ApiError): string {
  switch (err.code) {
    case 'update_window_expired':
      return 'error: đã quá 24h từ lần update cuối — không sửa được nữa'
    case 'not_owner':
      return 'error: bạn không phải chủ note này. Chỉ người tạo note mới sửa hoặc xoá được.'
    case 'update_limit_reached':
      return `error: đã đạt giới hạn 100 lần update trong 24h${err.retryAfter ? ` — thử lại sau ${err.retryAfter}s` : ''}`
    case 'ext_mismatch':
      return 'error: không đổi được extension (.md ↔ .html)'
    case 'note_not_found':
      return 'error: note không tồn tại hoặc đã bị xoá.'
    case 'missing_required_meta':
      return `error: thiếu header bắt buộc — ${err.message}`
    case 'invalid_client_type':
      return `error: clientType không hợp lệ — ${err.message}`
    case 'invalid_token':
      return 'error: token không hợp lệ hoặc không tồn tại. Lấy token mới ở my.avada.net, mục Notes key.'
    case 'token_revoked':
      // Server cố tình không phân biệt "bị revoke" với "hết ân hạn 24h sau
      // rotate" — cả hai đều là token_revoked, nên thông điệp nêu cả hai.
      return 'error: token đã bị thu hồi, hoặc đã hết ân hạn 24h sau khi rotate key. Dùng token mới nhất, hoặc vào my.avada.net mục Notes key để tạo key mới.'
    case 'insufficient_scope':
      return 'error: token không có quyền cho thao tác này (master key chỉ cấp được key, không thao tác được note). Dùng token cá nhân lấy ở my.avada.net, mục Notes key.'
    default:
      return `error: ${err.message}`
  }
}

function friendlyPrivateError(err: ApiError, status: number): string {
  switch (err.code) {
    case 'invalid_expiry':
      return 'error: hạn dùng không hợp lệ — giá trị hợp lệ: 7d, 30d, 90d, never.'
    case 'invalid_envelope':
      return 'error: dữ liệu mã hoá không hợp lệ — kiểm tra envelope và tạo lại note.'
    case 'invalid_token':
    case 'token_revoked':
    case 'insufficient_scope':
      return friendlyApiError(err)
  }
  // Không in message từ server: phản hồi lỗi có thể chứa dữ liệu nhạy cảm.
  switch (status) {
    case 401:
      return 'error: token thiếu hoặc không hợp lệ. Lấy token mới ở my.avada.net, mục Notes key.'
    case 403:
      return 'error: token không có quyền tạo private note. Dùng token cá nhân ở my.avada.net.'
    case 413:
      return 'error: nội dung mã hoá quá lớn. Giảm kích thước file rồi thử lại.'
    case 429:
      return 'error: gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'
    case 400:
      return 'error: yêu cầu tạo private note không hợp lệ. Kiểm tra file, hạn dùng và envelope.'
    default:
      return 'error: không tạo được private note. Vui lòng thử lại sau.'
  }
}

async function createPrivateNote(content: string, ext: SupportedExt, expiresIn: PrivateExpiry, linkKey: boolean): Promise<number> {
  try {
    const key = linkKey ? generateKey() : undefined
    const password = key ? undefined : generatePassword()
    const envelope = key
      ? await encryptWithKey(content, key)
      : await encryptWithPassword(content, password!)
    const res = await fetch(`${API_BASE}/api/private`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTES_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ext, expiresIn, envelope }),
    })
    if (!res.ok) {
      process.stderr.write(friendlyPrivateError(await readApiError(res), res.status) + '\n')
      return 6
    }

    const result = await res.json() as { id: string; url: string; expiresAt: string | null }
    if (!result?.id || typeof result.url !== 'string' || !result.url || /[\r\n]/.test(result.url)) {
      throw new Error('invalid_response')
    }
    let expiry: string
    if (expiresIn === 'never') {
      if (result.expiresAt !== null) throw new Error('invalid_response')
      expiry = 'Hết hạn: không'
    } else {
      if (typeof result.expiresAt !== 'string') throw new Error('invalid_response')
      const date = new Date(result.expiresAt).toISOString().slice(0, 10)
      expiry = `Hết hạn: ${date} (${parseInt(expiresIn, 10)} ngày)`
    }

    if (key) {
      process.stdout.write(`${result.url}#k=${toBase64Url(key)}\nKhoá nằm trong link — ai có nguyên link này và đăng nhập được Avader là đọc được.\n${expiry}\n`)
    } else {
      process.stdout.write(`${result.url}\nPassword: ${password}\n${expiry}\nGửi link và password qua HAI kênh khác nhau — dán chung một tin nhắn là mất tác dụng bảo vệ.\n`)
    }
    return 0
  } catch {
    process.stderr.write('error: không mã hoá hoặc tạo được private note. Kiểm tra kết nối và thử lại.\n')
    return 6
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const args = parseArgs(argv)

  if (args.help) {
    process.stdout.write(HELP)
    return 0
  }

  if (args.private && argv.includes('--update')) {
    process.stderr.write('error: private note không sửa được, tạo note mới\n')
    return 2
  }
  if (args.private && argv.includes('--delete')) {
    process.stderr.write('error: --private không dùng chung với --delete; dùng --delete <id> bình thường để xoá\n')
    return 2
  }
  if (!args.private && (args.expires !== undefined || args.linkKey)) {
    process.stderr.write('error: --expires và --link-key chỉ dùng khi có --private\n')
    return 2
  }
  if (args.expires !== undefined && !['7d', '30d', '90d', 'never'].includes(args.expires)) {
    process.stderr.write('error: --expires không hợp lệ — giá trị hợp lệ: 7d, 30d, 90d, never\n')
    return 2
  }

  if (args.updateTarget && args.deleteTarget) {
    process.stderr.write('error: --update và --delete không dùng chung được\n')
    return 2
  }

  // --delete không cần file; mọi lệnh còn lại thì có.
  if (!args.filePath && !args.deleteTarget) {
    process.stderr.write(HELP)
    return 2
  }

  if (args.kind && !['content', 'typo', 'restructure', 'other'].includes(args.kind)) {
    process.stderr.write(`error: invalid --kind "${args.kind}" — must be content|typo|restructure|other\n`)
    return 2
  }

  if (!NOTES_API_KEY) {
    process.stderr.write('error: NOTES_API_KEY env var is required\n')
    return 8
  }

  // Delete path — dừng trước khi đọc file, không cần ext.
  if (args.deleteTarget) {
    let parsed: { id: string; ext?: SupportedExt }
    try {
      parsed = parseUpdateTarget(args.deleteTarget)
    } catch (err) {
      process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
      return 2
    }

    let result: DeleteResult | ApiError
    try {
      result = await deleteNote(parsed.id)
    } catch (err) {
      process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
      return 6
    }

    if (isApiError(result)) {
      process.stderr.write(friendlyApiError(result) + '\n')
      const knownDeleteCodes = [
        'note_not_found',
        'not_owner',
        'insufficient_scope',
        'token_revoked',
        'invalid_token',
        'invalid_token_scheme',
        'missing_token',
        'rate_limited'
      ]
      return knownDeleteCodes.includes(result.code) ? 9 : 6
    }

    process.stdout.write(`deleted ${result.id} at ${new Date(result.deletedAt).toISOString()}\n`)
    return 0
  }

  const absPath = resolve(args.filePath!)
  const rawExt = extname(absPath).toLowerCase().replace(/^\./, '')

  if (rawExt !== 'md' && rawExt !== 'html') {
    if (args.private) {
      process.stderr.write('error: private note chỉ hỗ trợ file .md và .html\n')
      return 2
    }
    process.stderr.write(`error: unsupported extension ".${rawExt}" — only .md / .html supported\n`)
    return 4
  }
  const ext = rawExt as SupportedExt

  let source: string
  try {
    source = await readFile(absPath, 'utf-8')
  } catch {
    process.stderr.write(`error: file not found: ${absPath}\n`)
    return 3
  }

  // Mã hoá nguyên file, kể cả frontmatter; không lộ title qua log hoặc metadata.
  if (args.private) {
    return createPrivateNote(source, ext, (args.expires ?? '30d') as PrivateExpiry, args.linkKey ?? false)
  }

  let body: string
  if (ext === 'md') {
    const { title, password, body: parsed } = parseFrontmatter(source)
    if (password !== undefined) {
      process.stderr.write('[!] WARNING: `password` in frontmatter is deprecated and ignored.\n')
    }
    if (title) {
      process.stderr.write(`[i] title "${title}" stored as plaintext metadata only.\n`)
    }
    body = parsed
  } else {
    body = source
  }

  // Update path
  if (args.updateTarget) {
    let parsed: { id: string; ext?: SupportedExt }
    try {
      parsed = parseUpdateTarget(args.updateTarget)
    } catch (err) {
      process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
      return 2
    }

    if (parsed.ext && parsed.ext !== ext) {
      process.stderr.write(`error: file extension ".${ext}" doesn't match note extension ".${parsed.ext}"\n`)
      return 7
    }

    // Gửi content SẠCH — server tự tính diff (so blob cũ/mới) và render bảng
    // "Lịch sử thay đổi" ở cuối note (Ai / Email / Diff / Loại / Tóm tắt).
    // KHÔNG inject changelog vào content: sẽ làm bẩn blob và sai diff.
    const meta = await collectMeta(absPath)
    let result: UpdateResult | ApiError
    try {
      result = await updateNote(parsed.id, ext, body, meta, args.summary, args.kind)
    } catch (err) {
      process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
      return 6
    }

    if (isApiError(result)) {
      process.stderr.write(friendlyApiError(result) + '\n')
      const knownUpdateCodes = [
        'update_window_expired',
        'not_owner',
        'update_limit_reached',
        'ext_mismatch',
        'note_not_found',
        'missing_required_meta',
        'invalid_client_type',
        'insufficient_scope',
        'token_revoked',
        'invalid_token'
      ]
      return knownUpdateCodes.includes(result.code) ? 7 : 6
    }

    process.stdout.write(`${result.url} (update #${result.updateSeq} of ${result.updateCount})\n`)
    return 0
  }

  // Create path (existing behaviour — exit 6 on mọi thất bại, giữ nguyên contract)
  let created: string | ApiError
  try {
    created = await uploadNote(body, ext)
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 6
  }

  if (typeof created !== 'string') {
    process.stderr.write(friendlyApiError(created) + '\n')
    return 6
  }

  process.stdout.write(created + '\n')
  return 0
}

main().then(code => process.exit(code)).catch(err => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : err}\n`)
  process.exit(1)
})
