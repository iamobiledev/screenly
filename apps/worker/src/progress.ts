export type ProcessingStage =
  | "downloading"
  | "inspecting"
  | "transcoding"
  | "uploading_playback"
  | "generating_preview"
  | "packaging_hls"
  | "uploading_assets"
  | "finalizing";

export type ProgressUpdate = {
  stage: ProcessingStage;
  progressBasisPoints: number;
  etaSeconds: number | null;
};

export type StageEstimate = {
  stage: Exclude<ProcessingStage, "downloading" | "inspecting">;
  estimatedSeconds: number;
};

type ProgressSink = (update: ProgressUpdate) => Promise<void>;

const MINIMUM_SAMPLE_MILLISECONDS = 750;
const UPDATE_INTERVAL_MILLISECONDS = 1_000;
const PRELUDE_PROGRESS: Record<"downloading" | "inspecting", [number, number]> =
  {
    downloading: [100, 800],
    inspecting: [800, 1_000],
  };

export class TransferRateEstimator {
  private readonly startedAt: number;
  private lastBytes = 0;
  private lastSampleAt: number;
  private bytesPerSecond: number | null = null;

  constructor(now = Date.now()) {
    this.startedAt = now;
    this.lastSampleAt = now;
  }

  sample(transferredBytes: number, totalBytes: number, now = Date.now()) {
    const safeTotal = Math.max(1, totalBytes);
    const safeTransferred = Math.min(
      safeTotal,
      Math.max(this.lastBytes, transferredBytes),
    );
    const elapsedMilliseconds = now - this.lastSampleAt;
    const bytesSinceLastSample = safeTransferred - this.lastBytes;

    if (elapsedMilliseconds > 0 && bytesSinceLastSample > 0) {
      const instantaneousRate =
        bytesSinceLastSample / (elapsedMilliseconds / 1_000);
      this.bytesPerSecond =
        this.bytesPerSecond === null
          ? instantaneousRate
          : this.bytesPerSecond * 0.75 + instantaneousRate * 0.25;
      this.lastBytes = safeTransferred;
      this.lastSampleAt = now;
    }

    const hasUsefulSample =
      now - this.startedAt >= MINIMUM_SAMPLE_MILLISECONDS &&
      this.bytesPerSecond !== null &&
      this.bytesPerSecond > 0;
    const remainingBytes = Math.max(0, safeTotal - safeTransferred);

    return {
      fraction: safeTransferred / safeTotal,
      bytesPerSecond: this.bytesPerSecond,
      etaSeconds: hasUsefulSample
        ? remainingBytes / this.bytesPerSecond!
        : null,
    };
  }
}

export class ProcessingProgressReporter {
  private plan: StageEstimate[] = [];
  private completedStages = new Set<ProcessingStage>();
  private currentStage: ProcessingStage = "downloading";
  private currentFraction = 0;
  private currentRemainingSeconds: number | null = null;
  private lastProgressBasisPoints = 0;
  private lastEmittedAt = 0;
  private writes = Promise.resolve();
  private writeError: unknown = null;

  constructor(
    private readonly sink: ProgressSink,
    private readonly now: () => number = Date.now,
  ) {}

  configurePlan(plan: StageEstimate[]) {
    if (plan.length === 0) {
      throw new Error("The processing progress plan cannot be empty.");
    }
    this.plan = plan.map((entry) => ({
      ...entry,
      estimatedSeconds: normalizeEstimate(entry.estimatedSeconds),
    }));
  }

  async beginStage(stage: ProcessingStage) {
    if (this.currentStage !== stage) {
      this.completedStages.add(this.currentStage);
    }
    this.currentStage = stage;
    this.currentFraction = 0;
    this.currentRemainingSeconds = null;
    this.emit(true);
    await this.flush();
  }

  report(
    fraction: number,
    estimatedRemainingSeconds: number | null,
    force = false,
  ) {
    this.currentFraction = Math.max(
      this.currentFraction,
      Math.min(1, Math.max(0, fraction)),
    );
    this.currentRemainingSeconds =
      estimatedRemainingSeconds === null ||
      !Number.isFinite(estimatedRemainingSeconds)
        ? null
        : Math.max(0, estimatedRemainingSeconds);
    this.emit(force);
  }

  async completeStage() {
    this.currentFraction = 1;
    this.currentRemainingSeconds = 0;
    this.completedStages.add(this.currentStage);
    this.emit(true);
    await this.flush();
  }

  async flush() {
    await this.writes;
    if (this.writeError) {
      throw this.writeError;
    }
  }

  private emit(force: boolean) {
    if (this.writeError) {
      return;
    }

    const now = this.now();
    if (
      !force &&
      now - this.lastEmittedAt < UPDATE_INTERVAL_MILLISECONDS
    ) {
      return;
    }

    const snapshot = this.snapshot();
    this.lastEmittedAt = now;
    this.writes = this.writes
      .then(() => this.sink(snapshot))
      .catch((error: unknown) => {
        this.writeError = error;
        console.error(
          JSON.stringify({
            level: "error",
            message: "Could not persist processing progress.",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
  }

  private snapshot(): ProgressUpdate {
    const [progressBasisPoints, etaSeconds] =
      this.currentStage === "downloading" ||
      this.currentStage === "inspecting"
        ? this.preludeSnapshot(this.currentStage)
        : this.plannedSnapshot();

    this.lastProgressBasisPoints = Math.max(
      this.lastProgressBasisPoints,
      Math.min(9_900, Math.round(progressBasisPoints)),
    );

    return {
      stage: this.currentStage,
      progressBasisPoints: this.lastProgressBasisPoints,
      etaSeconds:
        etaSeconds === null ? null : Math.max(0, Math.ceil(etaSeconds)),
    };
  }

  private preludeSnapshot(
    stage: "downloading" | "inspecting",
  ): [number, number | null] {
    const [start, end] = PRELUDE_PROGRESS[stage];
    return [
      start + (end - start) * this.currentFraction,
      this.currentRemainingSeconds,
    ];
  }

  private plannedSnapshot(): [number, number | null] {
    if (this.plan.length === 0) {
      return [1_000, null];
    }

    const totalWeight = this.plan.reduce(
      (total, entry) => total + entry.estimatedSeconds,
      0,
    );
    let completedWeight = 0;
    let futureWeight = 0;
    let currentWeight = 0;
    let foundCurrent = false;

    for (const entry of this.plan) {
      if (entry.stage === this.currentStage) {
        currentWeight = entry.estimatedSeconds;
        foundCurrent = true;
        continue;
      }
      if (this.completedStages.has(entry.stage)) {
        completedWeight += entry.estimatedSeconds;
      } else if (foundCurrent) {
        futureWeight += entry.estimatedSeconds;
      }
    }

    if (!foundCurrent) {
      return [this.lastProgressBasisPoints || 1_000, null];
    }

    const weightedFraction =
      (completedWeight + currentWeight * this.currentFraction) / totalWeight;
    const progressBasisPoints = 1_000 + weightedFraction * 8_900;
    const etaSeconds =
      this.currentRemainingSeconds === null
        ? null
        : this.currentRemainingSeconds + futureWeight;

    return [progressBasisPoints, etaSeconds];
  }
}

export function createStagePlan(input: {
  durationSeconds: number;
  sizeBytes: number;
  needsTranscode: boolean;
  needsHls: boolean;
}): StageEstimate[] {
  const duration = Math.max(1, input.durationSeconds);
  const sourceMebibytes = Math.max(1, input.sizeBytes / (1_024 * 1_024));
  const estimatedPlaybackMebibytes = input.needsTranscode
    ? Math.min(sourceMebibytes, (duration * 2_000_000) / 8 / (1_024 * 1_024))
    : sourceMebibytes;
  const plan: StageEstimate[] = [];

  if (input.needsTranscode) {
    plan.push({
      stage: "transcoding",
      estimatedSeconds: Math.max(5, duration / 1.2),
    });
    plan.push({
      stage: "uploading_playback",
      estimatedSeconds: Math.max(0.5, estimatedPlaybackMebibytes / 25),
    });
  }

  plan.push({
    stage: "generating_preview",
    estimatedSeconds: 0.75,
  });

  plan.push({
    stage: "uploading_assets",
    estimatedSeconds: 0.25,
  });

  if (input.needsHls) {
    plan.push({
      stage: "packaging_hls",
      estimatedSeconds: Math.max(
        0.5,
        duration / 200 + estimatedPlaybackMebibytes / 25,
      ),
    });
  }

  plan.push({ stage: "finalizing", estimatedSeconds: 0.25 });

  return plan;
}

function normalizeEstimate(value: number) {
  return Number.isFinite(value) ? Math.max(0.25, value) : 1;
}
