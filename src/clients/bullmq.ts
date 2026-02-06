import lodash from "lodash";
import { pack } from "msgpackr";
import { Queue, Worker, Job, type JobsOptions } from "bullmq";

import * as r from "./redis";
import * as tasks from "../tasks";

type Tasks = typeof tasks;
type TaskName = keyof Tasks;

type BullTaskRepo = {
  [k in TaskName]: (data: Parameters<Tasks[k]>[0], opts?: JobsOptions) => Promise<Job<Parameters<Tasks[k]>[0], Awaited<ReturnType<Tasks[k]>>>>;
};

declare global {
  /** TaskRepo */
  var bull: BullTaskRepo;
  /** TaskRepo (Create Or Retry)  */
  var bull2: BullTaskRepo;

  /** Bullmq instance */
  var bullmq: Queue<Job>;
  /** Bullmq worker */
  var bullWorker: Worker;
}

export async function create() {
  await r.create();

  const keyPrefix = lodash.get(globalThis.redis, ["options", "keyPrefix"], "mq:");
  const prefix = keyPrefix ? keyPrefix.slice(0, -1) : "";

  const connection = globalThis.redis.duplicate({
    keyPrefix: "",
    lazyConnect: false,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  });

  const options = {
    prefix,
    connection,
    defaultJobOptions: {
      stackTraceLimit: 3,
      removeOnComplete: {
        count: 1000,
        age: 10 * 24 * 3600,
      },
      removeOnFail: {
        count: 200000,
        age: 30 * 24 * 3600,
      },
    },
  };

  const QUEUE_NAME = "bull";

  const queue = new Queue(QUEUE_NAME, options);

  const worker = new Worker(
    QUEUE_NAME,
    async function (job) {
      let { name } = job;
      const handler = lodash.get(tasks, name);
      if (lodash.isFunction(lodash.get(tasks, name))) {
        return handler.call(job, job.data);
      } else {
        throw Error(`Handler name \`${name}\` not found`);
      }
    },
    {
      ...options,
      concurrency: parseInt(process.env.BULLMQ_CONCURRENCY!) || 3,
    }
  );

  globalThis.bullmq = queue;
  globalThis.bullWorker = worker;

  globalThis.bull = Object.keys(tasks).reduce((acc, name) => {
    acc[name] = (data: any, opts?: any) => queue.add(name, data, opts);
    return acc;
  }, {} as any);

  globalThis.bull2 = Object.keys(tasks).reduce((acc, name) => {
    acc[name] = async (data: any, opts?: any) => {
      opts ??= {};

      lodash.defaults(opts, {
        jobId: [name, lodash.isNil(data) ? undefined : pack(data).toString("base64url")].join("_"),
      });

      let job = await bullmq.getJob(opts.jobId);
      await job?.remove();

      return bullmq.add(name, data, opts);
    };

    return acc;
  }, {} as any);
}

export async function destroy() {
  await r.destroy();
  await Promise.allSettled([bullmq.close(), bullWorker.close()]);
}
