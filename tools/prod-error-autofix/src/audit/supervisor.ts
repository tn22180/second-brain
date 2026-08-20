import {spawnClaude, type ClaudeRunner} from '../agent/claudeCli';
import {renderReport, type ReportInput} from './report';

/**
 * Lane C. It does not re-scan anything — it takes the same `ReportInput`
 * `renderReport` renders and may reorder or compress the prose. It is never
 * allowed to be the only path to a message: a timeout, an error or an empty
 * answer all fall back to the plain render, because a broken agent at 06:00
 * must not mean a morning with real findings goes unreported.
 */

export interface SupervisorOptions {
  model: string;
  timeoutMs: number;
  brainSlice: string | undefined;
}

const DEFAULT_OPTIONS: SupervisorOptions = {
  model: 'claude-sonnet-5',
  timeoutMs: 5 * 60 * 1000,
  brainSlice: undefined
};

export function buildSupervisorPrompt(input: ReportInput, draft: string): string {
  return [
    '# Audit report — tighten the draft below',
    '',
    'The draft is already correct and complete — every finding, count, failed lane and',
    'the cost line come straight from the scan. Your job is ordering and wording only:',
    'you may reorder, tighten or rephrase, but you must not add, drop or change any',
    'finding, file:line, count, app name or number.',
    '',
    'Keep it Vietnamese, terse. Keep the cost line labelled exactly',
    '`quy đổi (chạy trên gói)` if it is present — never rephrase it as money spent.',
    "Keep any `.claude/skills` gap line and any `Lane lỗi` line if they are present.",
    'Reply with the final message text and nothing else — no preamble, no markdown fences.',
    '',
    '## Draft',
    '',
    draft
  ].join('\n');
}

export async function runSupervisor(
  input: ReportInput,
  claude: ClaudeRunner = spawnClaude,
  options: Partial<SupervisorOptions> = {}
): Promise<string> {
  const fallback = renderReport(input);
  const opts = {...DEFAULT_OPTIONS, ...options};

  let res;
  try {
    res = await claude({
      prompt: buildSupervisorPrompt(input, fallback),
      model: opts.model,
      appendSystemPrompt: opts.brainSlice,
      // No repo checkout involved — the supervisor only reorders structured
      // results, so its cwd is wherever the process happens to run.
      cwd: process.cwd(),
      allowedTools: [],
      addDirs: [],
      permissionMode: 'default',
      timeoutMs: opts.timeoutMs
    });
  } catch {
    return fallback;
  }

  if (!res.ok) return fallback;
  const text = res.text.trim();
  if (!text) return fallback;
  return text;
}
