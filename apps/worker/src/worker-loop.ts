export type WorkerLoopEvent<Work = unknown> =
  | {
      type: "claim_failed";
      error: unknown;
    }
  | {
      type: "processing_attempt_failed";
      attempt: number;
      maxAttempts: number;
      error: unknown;
      work: Work;
    }
  | {
      type: "retry_unavailable";
      attempt: number;
      work: Work;
    }
  | {
      type: "reclaim_failed";
      attempt: number;
      error: unknown;
      work: Work;
    };

export type WorkerLoopOptions<Work> = {
  claim: () => Promise<Work | null>;
  process: (work: Work) => Promise<void>;
  reclaim: (work: Work) => Promise<Work | null>;
  pollIntervalMs: number;
  maxAttempts: number;
  signal: AbortSignal;
  log: (event: WorkerLoopEvent<Work>) => void;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

export async function runWorkerLoop<Work>(
  options: WorkerLoopOptions<Work>,
): Promise<void> {
  const wait = options.sleep ?? sleep;

  while (!options.signal.aborted) {
    let work: Work | null;
    try {
      work = await options.claim();
    } catch (error) {
      options.log({ type: "claim_failed", error });
      await waitUnlessAborted(
        wait,
        options.pollIntervalMs,
        options.signal,
      );
      continue;
    }

    if (!work) {
      await waitUnlessAborted(
        wait,
        options.pollIntervalMs,
        options.signal,
      );
      continue;
    }

    for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
      try {
        await options.process(work);
        break;
      } catch (error) {
        options.log({
          type: "processing_attempt_failed",
          attempt,
          maxAttempts: options.maxAttempts,
          error,
          work,
        });
        if (attempt === options.maxAttempts || options.signal.aborted) {
          break;
        }

        await waitUnlessAborted(
          wait,
          retryDelay(options.pollIntervalMs, attempt),
          options.signal,
        );
        if (options.signal.aborted) {
          break;
        }

        const failedWork = work;
        let reclaimedWork: Work | null;
        try {
          reclaimedWork = await options.reclaim(failedWork);
        } catch (reclaimError) {
          options.log({
            type: "reclaim_failed",
            attempt,
            error: reclaimError,
            work: failedWork,
          });
          break;
        }
        if (!reclaimedWork) {
          options.log({
            type: "retry_unavailable",
            attempt,
            work: failedWork,
          });
          break;
        }
        work = reclaimedWork;
      }
    }
  }
}

function retryDelay(pollIntervalMs: number, failedAttempt: number) {
  return Math.min(30_000, pollIntervalMs * 2 ** (failedAttempt - 1));
}

async function waitUnlessAborted(
  wait: (milliseconds: number, signal: AbortSignal) => Promise<void>,
  milliseconds: number,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    return;
  }
  await wait(milliseconds, signal);
}

function sleep(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });

    function finish() {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}
