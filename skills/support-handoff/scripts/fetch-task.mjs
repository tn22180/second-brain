// scripts/fetch-task.mjs — fetch 1 task Jira theo key.
import { jiraEnv, jiraFetch, FIELDS, errorBody } from '../../../scripts/lib/jira.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SKILL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const key = (process.argv[2] || '').trim();
  if (!key) { console.error('USAGE: fetch-task.mjs FAL-xxx'); process.exit(1); }

  const env = jiraEnv(SKILL_ROOT);
  const mrField = FIELDS.mergeRequest;
  const { status, json: i, text } = await jiraFetch(
    `/rest/api/2/issue/${key}?fields=summary,status,description,${mrField}`, { env }
  );
  if (!(status >= 200 && status < 300)) { console.error(`JIRA_ERROR ${status}: ${errorBody(i, text)}`); process.exit(1); }

  console.log(JSON.stringify({
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status?.name,
    mergeRequestRaw: i.fields[mrField] ?? null,
    description: i.fields.description ?? '',
  }, null, 2));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
