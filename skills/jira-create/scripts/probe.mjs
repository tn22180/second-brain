import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv, jiraFetch } from './lib/jira.mjs';

const env = loadEnv();
const out = { baseUrl: env.baseUrl, probedAt: process.env.PROBE_DATE || 'unknown' };

// project + issue types
const proj = await jiraFetch('/rest/api/2/project/FAL', { env });
out.project = { key: proj.json.key, id: proj.json.id };
out.issueTypes = {};
let subtaskEnabled = false;
for (const it of proj.json.issueTypes || []) {
  out.issueTypes[it.name] = it.id;
  if (it.subtask) subtaskEnabled = true;
}
out.subtaskEnabled = subtaskEnabled;

// required + Falcon App options qua createmeta API mới, cho từng issue type
out.requiredOnCreate = {};
out.falconAppRequired = false;
out.falconApps = [];
out.priorityAllowed = [];
out.devPointAllowed = [];
out.testerPointAllowed = [];
out.dueDateOnScreen = false;
for (const [name, id] of Object.entries(out.issueTypes)) {
  const cm = await jiraFetch(`/rest/api/2/issue/createmeta/FAL/issuetypes/${id}`, { env });
  const vals = cm.json.values || [];
  out.requiredOnCreate[name] = vals.filter(f => f.required).map(f => f.fieldId);
  const fa = vals.find(f => f.fieldId === 'customfield_11203');
  if (fa) {
    if (fa.required) out.falconAppRequired = true;
    if (!out.falconApps.length) out.falconApps = (fa.allowedValues || []).map(o => o.value);
  }
  const pr = vals.find(f => f.fieldId === 'priority');
  if (pr && !out.priorityAllowed.length) out.priorityAllowed = (pr.allowedValues || []).map(o => o.name);
  const dp = vals.find(f => f.fieldId === 'customfield_11204');
  if (dp && !out.devPointAllowed.length) out.devPointAllowed = (dp.allowedValues || []).map(o => o.value);
  const tp = vals.find(f => f.fieldId === 'customfield_11202');
  if (tp && !out.testerPointAllowed.length) out.testerPointAllowed = (tp.allowedValues || []).map(o => o.value);
  const dd = vals.find(f => f.fieldId === 'duedate');
  if (dd) out.dueDateOnScreen = true;
}

out.fields = {
  falconApp: 'customfield_11203', prd: 'customfield_11201', staging: 'customfield_11200',
  mergeRequest: 'customfield_10800', baPoint: 'customfield_10701', devPoint: 'customfield_11204',
  testerPoint: 'customfield_11202', designerPoint: 'customfield_10702',
  assignees: 'customfield_10700',
};
out.priorityDefault = { name: 'Medium', id: '3' };

// Issue Link Types (read-only) — dùng để chọn DEFAULT_LINK_TYPE cho Linked Issues (Bug↔Task, Tester).
const linkTypesRes = await jiraFetch('/rest/api/2/issueLinkType', { env });
out.issueLinkTypes = (linkTypesRes.json.issueLinkTypes || []).map(t => ({
  name: t.name, outward: t.outward, inward: t.inward,
}));

const metaPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'jira-metadata.json');
writeFileSync(metaPath, JSON.stringify(out, null, 2));
console.log('WROTE', metaPath);
console.log('subtaskEnabled=', out.subtaskEnabled, '| falconAppRequired=', out.falconAppRequired);
console.log('requiredOnCreate=', JSON.stringify(out.requiredOnCreate));
