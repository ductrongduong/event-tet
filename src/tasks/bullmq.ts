import lodash from "lodash";
import type { Job, FinishedStatus } from "bullmq";

export async function cleanTasks(this: Job, data?: { limit?: number; status?: FinishedStatus | "wait" | "delayed" }) {
  const limit = lodash.get(data, "limit", 1e6);
  const status = lodash.get(data, "status", "failed");

  await this.updateData({ limit, status });

  const value = await bullmq.clean(0, limit, status);

  return value;
}

export async function retryTasks(this: Job, data?: { limit?: number; status?: FinishedStatus }) {
  const limit = lodash.get(data, "limit", 1e6);
  const status = lodash.get(data, "status", "failed");

  await this.updateData({ limit, status });

  let total = Math.min(await bullmq.getFailedCount(), limit);

  const STEP = 100;
  for (let n = Math.ceil(total / STEP); n > 0; n--) {
    let jobs = await bullmq.getJobs(status, 0, STEP, true);

    if (!jobs.length) {
      break;
    }

    for (let job of jobs) {
      try {
        await job.retry(status);
      } catch {}
    }
  }

  return total;
}
