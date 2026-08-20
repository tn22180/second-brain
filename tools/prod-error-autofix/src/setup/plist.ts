import {homedir} from 'node:os';
import {delimiter, dirname, isAbsolute, join} from 'node:path';

/**
 * Generates this machine's launchd job.
 *
 * The plist cannot be a committed file with real paths in it: it carries a home
 * directory, a username, a node version and a service-account email, which is
 * exactly the set of things that must not travel with the package. So the repo
 * ships the renderer and `autofix init` writes the plist.
 */

export interface PlistInput {
  label: string;
  bunBin: string;
  entrypoint: string;
  workingDirectory: string;
  home: string;
  path: string;
  logDir: string;
  /**
   * gcloud identity for the daemon.
   *
   * A user credential expires on the org's session-length policy — roughly daily —
   * and a daemon cannot answer a reauth prompt: on 2026-07-31 four alerts came back
   * `blocked · gcloud auth` inside one half-hour window for that reason. A service
   * account has no such expiry. Set per-job rather than globally so an interactive
   * `gcloud` in a terminal still runs as the user.
   */
  serviceAccount: string | undefined;
}

/** `&` first, or the entities this escapes would be escaped again. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderPlist(input: PlistInput): string {
  const s = (v: string) => `<string>${xmlEscape(v)}</string>`;
  const serviceAccount = input.serviceAccount
    ? [
        '',
        '        <!--',
        '          Every gcloud call runs as this service account. A user credential expires on',
        '          the org session policy and a daemon cannot answer a reauth prompt; a service',
        '          account has no such expiry. Needs logging.read, plus functions describe and',
        '          run revisions list for the deploy probes.',
        '        -->',
        '        <key>CLOUDSDK_CORE_ACCOUNT</key>',
        `        ${s(input.serviceAccount)}`
      ]
    : [];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '    <key>Label</key>',
    `    ${s(input.label)}`,
    '',
    '    <key>ProgramArguments</key>',
    '    <array>',
    `        ${s(input.bunBin)}`,
    '        <string>run</string>',
    `        ${s(input.entrypoint)}`,
    '        <string>daemon</string>',
    '    </array>',
    '',
    '    <key>WorkingDirectory</key>',
    `    ${s(input.workingDirectory)}`,
    '',
    '    <!--',
    '      PATH has to carry git, gcloud, npx and claude explicitly: launchd starts with a',
    '      minimal environment, and every one of those is spawned by the pipeline.',
    '    -->',
    '    <key>EnvironmentVariables</key>',
    '    <dict>',
    '        <key>HOME</key>',
    `        ${s(input.home)}`,
    ...serviceAccount,
    '        <key>PATH</key>',
    `        ${s(input.path)}`,
    '    </dict>',
    '',
    '    <!-- A long-running listener: start at load and restart if it dies. -->',
    '    <key>RunAtLoad</key>',
    '    <true/>',
    '    <key>KeepAlive</key>',
    '    <true/>',
    '',
    '    <!-- Do not hammer the API if it is crash-looping on a bad config. -->',
    '    <key>ThrottleInterval</key>',
    '    <integer>60</integer>',
    '',
    '    <key>StandardOutPath</key>',
    `    ${s(join(input.logDir, 'daemon.log'))}`,
    '    <key>StandardErrorPath</key>',
    `    ${s(join(input.logDir, 'daemon.err.log'))}`,
    '</dict>',
    '</plist>',
    ''
  ].join('\n');
}

/** Same shape as the daemon plist input — the audit job differs only in schedule, args and logs. */
export type AuditPlistInput = PlistInput;

/**
 * The 06:00 audit job's launchd plist.
 *
 * `StartCalendarInterval` instead of `RunAtLoad`+`KeepAlive`: the audit is a one-shot
 * (`bun run … audit --all`) that exits when the sweep finishes, and `KeepAlive` on a
 * program that exits restarts it in a loop rather than waiting for tomorrow (spec
 * "Scheduling", 2026-08-19). Separate `audit.log`/`audit.err.log` so its output never
 * interleaves with the daemon's in one file.
 */
export function renderAuditPlist(input: AuditPlistInput): string {
  const s = (v: string) => `<string>${xmlEscape(v)}</string>`;
  const serviceAccount = input.serviceAccount
    ? [
        '',
        '        <!--',
        '          Every gcloud call runs as this service account. A user credential expires on',
        '          the org session policy and a daemon cannot answer a reauth prompt; a service',
        '          account has no such expiry.',
        '        -->',
        '        <key>CLOUDSDK_CORE_ACCOUNT</key>',
        `        ${s(input.serviceAccount)}`
      ]
    : [];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '    <key>Label</key>',
    `    ${s(input.label)}`,
    '',
    '    <key>ProgramArguments</key>',
    '    <array>',
    `        ${s(input.bunBin)}`,
    '        <string>run</string>',
    `        ${s(input.entrypoint)}`,
    '        <string>audit</string>',
    '        <string>--all</string>',
    '    </array>',
    '',
    '    <key>WorkingDirectory</key>',
    `    ${s(input.workingDirectory)}`,
    '',
    '    <!--',
    '      PATH has to carry git, claude, npx and node explicitly: launchd starts with a',
    '      minimal environment, and the audit spawns eslint, the fix agent and git same as',
    '      the daemon does.',
    '    -->',
    '    <key>EnvironmentVariables</key>',
    '    <dict>',
    '        <key>HOME</key>',
    `        ${s(input.home)}`,
    ...serviceAccount,
    '        <key>PATH</key>',
    `        ${s(input.path)}`,
    '    </dict>',
    '',
    '    <!-- One-shot on a calendar. No KeepAlive: this program is meant to exit. -->',
    '    <key>StartCalendarInterval</key>',
    '    <dict>',
    '        <key>Hour</key>',
    '        <integer>6</integer>',
    '        <key>Minute</key>',
    '        <integer>0</integer>',
    '    </dict>',
    '',
    '    <key>StandardOutPath</key>',
    `    ${s(join(input.logDir, 'audit.log'))}`,
    '    <key>StandardErrorPath</key>',
    `    ${s(join(input.logDir, 'audit.err.log'))}`,
    '</dict>',
    '</plist>',
    ''
  ].join('\n');
}

/**
 * The directories launchd must be told about explicitly, and nothing else.
 *
 * Built from the resolved location of each binary the pipeline spawns, plus the
 * standard fallbacks. Deliberately NOT inherited from `process.env.PATH`: whoever
 * runs `init` may be inside a shell whose PATH carries editor shims, version-manager
 * shims and plugin cache directories pinned to a version that will be gone in a
 * month. Generating this from a session's PATH bakes that rot into a daemon that is
 * meant to run untouched for months.
 */
export function daemonPath(input: {toolPaths: string[]; home: string}): string {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (dir: string) => {
    if (!dir || seen.has(dir)) return;
    seen.add(dir);
    out.push(dir);
  };
  for (const tool of input.toolPaths) if (tool) add(dirname(tool));
  for (const dir of [
    join(input.home, '.local', 'bin'),
    join(input.home, '.bun', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ]) {
    add(dir);
  }
  return out.join(delimiter);
}

/** The binaries the pipeline spawns. A missing one is `doctor`'s problem, not this function's. */
export const DAEMON_TOOLS = ['bun', 'claude', 'git', 'gcloud', 'npx', 'node'] as const;

export interface ResolveInput {
  projectRoot: string;
  cacheRoot: string;
  label: string;
  serviceAccount: string | undefined;
  env: Record<string, string | undefined>;
  /** Absolute path of the running `bun`. */
  bunBin: string;
  /** Resolved absolute paths of the other daemon tools; unresolvable ones are dropped. */
  toolPaths: string[];
}

export function resolvePlistInput(input: ResolveInput): PlistInput {
  const home = input.env.HOME || homedir();
  return {
    label: input.label,
    bunBin: input.bunBin,
    entrypoint: join(input.projectRoot, 'bin', 'autofix.ts'),
    workingDirectory: input.projectRoot,
    home,
    path: daemonPath({
      // bun first: without it launchd cannot start the process at all. Filtered on
      // absoluteness, not existence: `resolveClaudeBin` falls back to the bare name
      // `claude`, whose dirname is `.` — a relative entry in a daemon PATH is worse
      // than no entry. Whether each tool is actually there is `doctor`'s question.
      toolPaths: [input.bunBin, ...input.toolPaths].filter(p => p && isAbsolute(p)),
      home
    }),
    logDir: input.cacheRoot,
    serviceAccount: input.serviceAccount
  };
}

/** Where the generated job goes, and how it is loaded. */
export function installHint(label: string, plistPath: string): string {
  return [
    `  cp ${plistPath} ~/Library/LaunchAgents/${label}.plist`,
    `  launchctl load ~/Library/LaunchAgents/${label}.plist`,
    `  launchctl stop ${label} && launchctl start ${label}    # restart after a code change`,
    `  launchctl unload ~/Library/LaunchAgents/${label}.plist  # stop for good`
  ].join('\n');
}
