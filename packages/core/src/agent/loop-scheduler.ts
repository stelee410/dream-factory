export interface LoopTask {
  id: string;
  prompt: string;
  intervalMs: number;
  maxRuns?: number;
  runCount: number;
  running: boolean;
  createdAt: Date;
  lastRunAt?: Date;
}

export interface LoopSchedulerCallbacks {
  /** Called when a loop tick starts. */
  onLoopStart: (task: LoopTask) => void;
  /** Called with the assistant response after a loop tick completes. */
  onLoopResult: (task: LoopTask, reply: string) => void;
  /** Called when a loop tick errors. */
  onLoopError: (task: LoopTask, error: string) => void;
  /** Called when a loop finishes (maxRuns reached or cancelled). */
  onLoopEnd: (task: LoopTask, reason: "completed" | "cancelled") => void;
}

type ProcessFn = (prompt: string) => Promise<string>;

let nextId = 1;

export class LoopScheduler {
  private tasks = new Map<string, LoopTask>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private callbacks: LoopSchedulerCallbacks;
  private processFn: ProcessFn;

  constructor(processFn: ProcessFn, callbacks: LoopSchedulerCallbacks) {
    this.processFn = processFn;
    this.callbacks = callbacks;
  }

  create(intervalMs: number, prompt: string, maxRuns?: number): LoopTask {
    const id = `loop-${nextId++}`;
    const task: LoopTask = {
      id,
      prompt,
      intervalMs,
      maxRuns,
      runCount: 0,
      running: false,
      createdAt: new Date(),
    };

    this.tasks.set(id, task);

    const timer = setInterval(() => {
      void this.tick(id);
    }, intervalMs);

    this.timers.set(id, timer);

    // Fire first tick immediately
    void this.tick(id);

    return task;
  }

  cancel(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    const timer = this.timers.get(id);
    if (timer) clearInterval(timer);
    this.timers.delete(id);
    this.tasks.delete(id);
    this.callbacks.onLoopEnd(task, "cancelled");
    return true;
  }

  cancelAll(): number {
    const ids = [...this.tasks.keys()];
    let count = 0;
    for (const id of ids) {
      if (this.cancel(id)) count++;
    }
    return count;
  }

  list(): LoopTask[] {
    return [...this.tasks.values()];
  }

  get size(): number {
    return this.tasks.size;
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.tasks.clear();
  }

  private async tick(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) return;

    // Skip if previous run is still in progress
    if (task.running) return;

    task.running = true;
    this.callbacks.onLoopStart(task);

    try {
      const reply = await this.processFn(task.prompt);
      task.runCount++;
      task.lastRunAt = new Date();
      task.running = false;

      this.callbacks.onLoopResult(task, reply);

      // Check if maxRuns reached
      if (task.maxRuns && task.runCount >= task.maxRuns) {
        const timer = this.timers.get(id);
        if (timer) clearInterval(timer);
        this.timers.delete(id);
        this.tasks.delete(id);
        this.callbacks.onLoopEnd(task, "completed");
      }
    } catch (e: any) {
      task.running = false;
      this.callbacks.onLoopError(task, e.message ?? String(e));
    }
  }
}

// ---- Helpers ----

const INTERVAL_RE = /^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|hour)$/i;

export function parseInterval(input: string): number | null {
  const m = INTERVAL_RE.exec(input.trim());
  if (!m) return null;
  const val = parseFloat(m[1]!);
  if (val <= 0 || !isFinite(val)) return null;
  const unit = m[2]!.toLowerCase();
  switch (unit) {
    case "s":
    case "sec":
      return Math.round(val * 1000);
    case "m":
    case "min":
      return Math.round(val * 60 * 1000);
    case "h":
    case "hr":
    case "hour":
      return Math.round(val * 3600 * 1000);
    default:
      return null;
  }
}

export function formatInterval(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3600_000).toFixed(1)}h`;
}

const LOOP_CMD_RE = /^(\d+(?:\.\d+)?(?:s|sec|m|min|h|hr|hour))\s+(?:(\d+)x\s+)?(.+)$/i;

/**
 * Parse `/loop <interval> [Nx] <prompt>` syntax.
 * Returns null if the format doesn't match.
 */
export function parseLoopCommand(args: string): {
  intervalMs: number;
  maxRuns?: number;
  prompt: string;
} | null {
  const m = LOOP_CMD_RE.exec(args.trim());
  if (!m) return null;
  const intervalMs = parseInterval(m[1]!);
  if (!intervalMs) return null;
  const maxRuns = m[2] ? parseInt(m[2], 10) : undefined;
  const prompt = m[3]!.trim();
  if (!prompt) return null;
  return { intervalMs, maxRuns, prompt };
}
