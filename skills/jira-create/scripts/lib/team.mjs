import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DEFAULT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'team-roster.json');

export function loadTeamRoster(path = DEFAULT_PATH) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error('MISSING_TEAM_ROSTER: không đọc được team-roster.json — kiểm tra đường dẫn hoặc chạy lại từ workspace root');
  }
  return JSON.parse(raw);
}

export function resolveTeamForUser(username, roster) {
  for (const [teamName, team] of Object.entries(roster.teams || {})) {
    const allMembers = Object.values(team.members || {}).flat();
    if (allMembers.includes(username)) {
      return { teamName, defined: !!team.defined };
    }
  }
  return null;
}

export function getTeamDevUsernames(teamName, roster) {
  return roster.teams?.[teamName]?.members?.dev || [];
}

// Danh sách designer dùng CHUNG cả team Falcon (design không thuộc riêng team nào). Chuẩn hoá về mảng:
// đọc field `designers` (mảng — chuẩn hiện hành) hoặc `designer` (chuỗi đơn — tương thích ngược). Trả
// mảng rỗng nếu chưa set. Trùng lặp/giá trị rỗng bị loại để hành vi assignee ổn định.
export function getDesigners(roster) {
  const d = roster?.designers ?? roster?.designer;
  const list = Array.isArray(d) ? d : (typeof d === 'string' && d ? [d] : []);
  return [...new Set(list.filter(Boolean))];
}

// Assignee mặc định cho task naming Solar tag `[DESIGN]`:
// - đúng 1 designer trong danh sách → giao designer đó (task có chủ rõ ràng);
// - nhiều designer (không biết giao ai) HOẶC chưa set → trả null để caller fallback về NGƯỜI TẠO task.
// Khi có >1 designer, agent nên chủ động gợi ý danh sách cho user chọn lúc dựng draft (xem core.md
// §Quy tắc đặt tên) — nhưng script không tự đoán, mặc định an toàn là người tạo.
export function defaultDesignAssignee(roster) {
  const ds = getDesigners(roster);
  return ds.length === 1 ? ds[0] : null;
}

export function buildTaskPriorityJql({ devUsernames }) {
  if (!Array.isArray(devUsernames) || devUsernames.length === 0) {
    return { priorityJql: null, otherJql: 'project = FAL AND issuetype = Task ORDER BY updated DESC' };
  }
  const list = devUsernames.join(', ');
  return {
    priorityJql: `project = FAL AND issuetype = Task AND assignee in (${list}) ORDER BY updated DESC`,
    // Nhánh "Task khác" phải gồm cả task CHƯA gán assignee. Jira: `assignee not in (...)` KHÔNG match
    // issue có assignee EMPTY/NULL — mà task mới tạo thường chưa gán ai, lại đúng loại task tester cần
    // báo bug nhất. Thiếu `OR assignee is EMPTY` thì các task đó biến mất khỏi cả 2 nhánh → danh sách
    // rỗng dù task tồn tại (phát hiện qua behavioral eval 2026-07-13).
    otherJql: `project = FAL AND issuetype = Task AND (assignee not in (${list}) OR assignee is EMPTY) ORDER BY updated DESC`,
  };
}
