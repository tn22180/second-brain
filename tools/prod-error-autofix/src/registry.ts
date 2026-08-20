import {join} from 'node:path';
import type {Config} from './config';

/**
 * appName -> repo. Every field here was read off the repos on disk, not assumed:
 *
 *   appName, prodProject   packages/functions/src/handlers/pubsub/handleProdErrorAlert.js
 *                          on each repo's default branch (the alert wiring is merged
 *                          in all five as of 2026-07-30)
 *   defaultBranch          git symbolic-ref refs/remotes/origin/HEAD
 *   testCmd                every repo has a root jest.config.js and jest at the root,
 *                          but only some declare a `test` script — `npx jest` at the
 *                          repo root is the one command that works across all five
 *   auditLintPaths         repo-relative dirs to lint (see AppSpec interface for
 *                          per-app list). Counts from 2026-08-20: seo has 1092+1394+5
 *                          files across functions, assets, scripttag. Excluded on
 *                          purpose: copyright has no src/ (one generated file);
 *                          seo dashboard src has zero .js; blogs editor has no src.
 *   auditKnip              knip needs a per-repo config; false until one exists and
 *                          a human has read a run.
 *
 * `test/registry.disk.test.ts` re-derives these from the repos and fails on drift.
 */

export interface AppSpec {
  /** Exactly the string the app passes to createErrorAlertHandler. */
  appName: string;
  repo: string;
  prodProject: string;
  defaultBranch: string;
  /** Run from the repo root. */
  testCmd: string[];
  /** Where the alert wiring lives — provenance for the brain and for drift checks. */
  alertHandler: string;
  /**
   * Repo-relative dirs the audit lints. Only the packages holding hand-written
   * app code: `copyright` and `dashboard` are generated or vendor trees and
   * would drown the report.
   */
  auditLintPaths: string[];
  /** knip needs a per-repo config; false until one exists and a human has read a run. */
  auditKnip: boolean;
}

export interface App extends AppSpec {
  repoPath: string;
}

const ALERT_HANDLER = 'packages/functions/src/handlers/pubsub/handleProdErrorAlert.js';
const JEST = ['npx', 'jest', '--ci'];

export const APPS: readonly AppSpec[] = [
  {
    appName: 'SEO',
    repo: 'seo',
    prodProject: 'avada-seo',
    defaultBranch: 'master',
    testCmd: JEST,
    alertHandler: ALERT_HANDLER,
    auditLintPaths: ['packages/functions/src', 'packages/assets/src', 'packages/scripttag/src'],
    auditKnip: false
  },
  {
    appName: 'BLOG',
    repo: 'blogs',
    prodProject: 'avada-blog-app',
    defaultBranch: 'master',
    testCmd: JEST,
    alertHandler: ALERT_HANDLER,
    auditLintPaths: ['packages/functions/src', 'packages/assets/src', 'packages/avadaseo/src'],
    auditKnip: false
  },
  {
    appName: 'APC',
    repo: 'ai-product-copy',
    prodProject: 'ai-product-copy',
    defaultBranch: 'master',
    testCmd: JEST,
    alertHandler: ALERT_HANDLER,
    auditLintPaths: ['packages/functions/src', 'packages/assets/src', 'packages/scripttag/src'],
    auditKnip: false
  },
  {
    // The only one that is not `master`. Branching a fix off master here would
    // create an MR against a branch that does not exist.
    appName: 'AEO',
    repo: 'llm-ai-search-seo',
    prodProject: 'seo-on-aeo',
    defaultBranch: 'main',
    testCmd: JEST,
    alertHandler: ALERT_HANDLER,
    auditLintPaths: ['packages/functions/src', 'packages/assets/src'],
    auditKnip: false
  },
  {
    appName: 'IMG-OPT',
    repo: 'avada-image-optimizer',
    prodProject: 'app-plaza-image-optimizer',
    defaultBranch: 'master',
    testCmd: JEST,
    alertHandler: ALERT_HANDLER,
    auditLintPaths: ['packages/functions/src', 'packages/assets/src', 'packages/scripttag/src'],
    auditKnip: false
  }
];

const BY_NAME = new Map(APPS.map(a => [a.appName.toUpperCase(), a]));

/**
 * Returns undefined for an app that is not in scope. Callers must surface that as
 * a reply on the thread — guessing a repo from a name is how a fix lands in the
 * wrong app.
 */
export function resolveApp(appName: string, cfg: Config): App | undefined {
  const spec = BY_NAME.get(appName.trim().toUpperCase());
  if (!spec) return undefined;
  return {...spec, repoPath: join(cfg.paths.reposRoot, spec.repo)};
}

export function listApps(cfg: Config): App[] {
  return APPS.map(spec => ({...spec, repoPath: join(cfg.paths.reposRoot, spec.repo)}));
}

export function appNames(): string[] {
  return APPS.map(a => a.appName);
}
