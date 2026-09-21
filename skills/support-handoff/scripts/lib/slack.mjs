// scripts/lib/slack.mjs — shim mỏng: mọi hành vi Slack nằm ở lib CHUNG cấp repo
// (`scripts/lib/slack.mjs`). Giữ file này để các script trong skill không phải đổi import,
// và để token vẫn lấy theo cấu hình riêng của skill (config.mjs).
//
// ĐỪNG thêm logic Slack ở đây — sửa ở lib chung, cả hai skill cùng hưởng.
import {
  parsePermalink as parse,
  readThread as read,
  postReply as post,
  getPermalink as permalink,
  slackApi as call,
} from '../../../../scripts/lib/slack.mjs';
import { getSlackToken } from './config.mjs';

export { parsePermalink } from '../../../../scripts/lib/slack.mjs';
export { tsFromP, isGetMethod, SLACK_GET_METHODS, makeUserNameResolver } from '../../../../scripts/lib/slack.mjs';

export const readThread = (channel, threadTs) => read(channel, threadTs, { token: getSlackToken() });
export const postReply = (channel, threadTs, text) => post(channel, threadTs, text, { token: getSlackToken() });
export const getPermalink = (channel, ts) => permalink(channel, ts, { token: getSlackToken() });
export const slackApi = (method, params) => call(method, params, { token: getSlackToken() });
void parse;
