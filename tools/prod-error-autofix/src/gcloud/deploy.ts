import {err, spawnRunner, type GcloudResult, type Runner} from './run';

/**
 * When did the code behind this service last change on prod?
 *
 * Used with the merge probe to tell "the fix is not deployed yet" apart from "the
 * fix is deployed and the error survived it". Getting that wrong in either
 * direction is expensive: one way wastes a pipeline run, the other leaves a real
 * bug looking handled.
 *
 * `gcloud functions describe --format=value(updateTime)` covers gen1 and gen2
 * both — verified on avada-blog-app `api` (GEN_2) and seo-on-aeo `proxy` (gen1).
 * Plain Cloud Run services fall back to the newest revision's creation time.
 *
 * Cloud Run jobs have no deploy timestamp to read. `gcloud run jobs describe`
 * exposes only `metadata.creationTimestamp` (when the job was first created) and
 * a `generation` counter; there is no `lastModifiedAt`. So for a `job:` service
 * this returns `deployedAtMs: undefined` plus the generation, which parks the
 * fingerprint at `awaiting_deploy` instead of guessing. A job fix therefore never
 * auto-escalates to a second attempt — that needs a human, and it is better than
 * treating an execution time as a deploy time.
 */

export interface DeployInfo {
  deployedAtMs: number | undefined;
  /** Which command produced the answer. Goes into the incident record. */
  source: 'functions.updateTime' | 'run.revision' | 'run.job.generation' | 'unknown';
  /** Cloud Run job config generation — bumps on each deploy. */
  generation: number | undefined;
  detail: string | undefined;
}

export interface ProbeDeployInput {
  projectId: string;
  /** Bare service name, no `job:` prefix. */
  serviceName: string;
  isJob: boolean;
  region: string;
  timeoutMs: number;
}

function parseIso(value: string): number | undefined {
  const ms = Date.parse(value.trim());
  return Number.isFinite(ms) ? ms : undefined;
}

export async function probeDeploy(
  input: ProbeDeployInput,
  runner: Runner = spawnRunner
): Promise<GcloudResult<DeployInfo>> {
  const {projectId, serviceName, region, timeoutMs} = input;

  if (input.isJob) {
    const res = await runner(
      [
        'gcloud',
        'run',
        'jobs',
        'describe',
        serviceName,
        `--project=${projectId}`,
        `--region=${region}`,
        '--format=value(metadata.generation)'
      ],
      timeoutMs
    );
    if (res.code !== 0) return err(res);
    const generation = Number(res.stdout.trim());
    return {
      ok: true,
      value: {
        deployedAtMs: undefined,
        source: 'run.job.generation',
        generation: Number.isFinite(generation) ? generation : undefined,
        detail: 'Cloud Run jobs expose no deploy timestamp; generation only'
      }
    };
  }

  const fn = await runner(
    [
      'gcloud',
      'functions',
      'describe',
      serviceName,
      `--project=${projectId}`,
      `--region=${region}`,
      '--format=value(updateTime)'
    ],
    timeoutMs
  );
  if (fn.code === 0) {
    const ms = parseIso(fn.stdout);
    if (ms !== undefined) {
      return {ok: true, value: {deployedAtMs: ms, source: 'functions.updateTime', generation: undefined, detail: undefined}};
    }
  } else {
    const failure = err(fn);
    // Auth is fatal everywhere; anything else just means "not a function".
    if (failure.failure === 'auth' || failure.failure === 'permission') return failure;
  }

  const rev = await runner(
    [
      'gcloud',
      'run',
      'revisions',
      'list',
      `--service=${serviceName}`,
      `--project=${projectId}`,
      `--region=${region}`,
      '--sort-by=~metadata.creationTimestamp',
      '--limit=1',
      '--format=value(metadata.creationTimestamp)'
    ],
    timeoutMs
  );
  if (rev.code !== 0) return err(rev);
  const ms = parseIso(rev.stdout);
  if (ms === undefined) {
    return {
      ok: true,
      value: {deployedAtMs: undefined, source: 'unknown', generation: undefined, detail: 'no revision timestamp'}
    };
  }
  return {ok: true, value: {deployedAtMs: ms, source: 'run.revision', generation: undefined, detail: undefined}};
}
