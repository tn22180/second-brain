import type {Store} from '../state/store';
import type {SlackApi} from './client';

/**
 * The only way this project should post a reply.
 *
 * Posting and recording the ts happen together on purpose: the alerting app and this
 * daemon are the same Slack app, so a reply is indistinguishable from an alert by
 * identity alone. If a reply's ts were ever left unrecorded and Slack redelivered it
 * as a top-level message, the daemon would treat its own writing as a new alert.
 */
export interface PostDeps {
  slack: SlackApi;
  store: Store;
  now?: () => number;
}

export async function postReply(
  deps: PostDeps,
  input: {channel: string; threadTs: string; text: string; blocks?: unknown}
): Promise<{ts: string | undefined}> {
  const now = deps.now ?? (() => Date.now());
  const res = await deps.slack.postThreadReply(input);
  if (res.ts) deps.store.markOwnReply(input.channel, res.ts, now());
  return res;
}
