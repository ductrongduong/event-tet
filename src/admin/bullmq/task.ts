import lodash from "lodash";
import { Type } from "@sinclair/typebox";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import type { Job } from "bullmq";
import type { Static } from "@sinclair/typebox";

import * as tasks from "@/tasks";
import { parseQuery, listArgs } from "../utils";

export const TASK_NAMES = Object.keys(tasks);

const plugin: FastifyPluginAsyncTypebox = async (app, opts) => {
  const name = "task_Task";

  const refName = (key: string) => [name, key].join("_");

  const JOB_STATUS = ["active", "failed", "completed", "delayed", "waiting"] as const;

  const tRead = Type.Object({
    id: Type.String(),
    name: Type.String(),
    data: Type.Optional(Type.Any()),
    opts: Type.Optional(Type.Any()),
    status: Type.Optional(Type.String()),
    delayTo: Type.Optional(Type.Date()),
    failedReason: Type.Optional(Type.String()),
    stacktrace: Type.Optional(Type.Any()),
    returnvalue: Type.Optional(Type.Any()),
    attemptsMade: Type.Integer(),
    createdAt: Type.Optional(Type.Date()),
    processedAt: Type.Optional(Type.Date()),
    finishedAt: Type.Optional(Type.Date()),
  });

  const tCreate = Type.Object({
    id: Type.Optional(Type.String()),
    name: Type.String({ enum: TASK_NAMES }),
    data: Type.Optional(Type.Any()),
    opts: Type.Optional(Type.Any()),
    delayTo: Type.Optional(Type.Date()),
  });

  const tUpdate = Type.Partial(
    Type.Object({
      data: Type.Any(),
      delayTo: Type.Date(),
    })
  );

  const tFilter = Type.Object(
    {
      status: Type.String({
        enum: JOB_STATUS,
        component: "Radio",
      }),
    },
    {
      default: {
        status: JOB_STATUS[1],
      },
    }
  );

  const schema = {
    id: Type.Pick(tRead, ["id"]),
    ids: Type.Object({ ids: Type.Array(Type.Index(tRead, ["id"])) }),
    read: tRead,
    create: tCreate,
    update: tUpdate,
    filter: tFilter,
  };

  type Schema = typeof schema;
  type SchemaKey = keyof Schema;

  const ref = <R extends SchemaKey>(k: R) => {
    return Type.Unsafe<Static<Schema[R]>>(Type.Ref(refName(k)));
  };

  for (const [key, val] of Object.entries(schema)) {
    app.addSchema(Object.assign(val, { $id: refName(key) }));
  }

  const format = async (job: Job) => {
    const status = await job.getState();
    Object.assign(job, { status });

    if (status === "delayed") {
      const client = await bullmq.client;
      const score = await client.zscore(bullmq.toKey("delayed"), job.id!);
      lodash.set(job, "delayTo", score ? new Date(Math.floor(parseInt(score) / 0x1000)) : undefined);
    }

    if (job.timestamp) {
      Object.assign(job, { createdAt: new Date(job.timestamp) });
    }
    if (job.processedOn) {
      Object.assign(job, { processedAt: new Date(job.processedOn) });
    }
    if (job.finishedOn) {
      Object.assign(job, { finishedAt: new Date(job.finishedOn) });
    }

    return job;
  };

  const formatAll = async (jobs: Job[]) => {
    return Promise.all(jobs.map((job) => format(job)));
  };

  app.get("/:ids", {
    schema: {
      params: ref("ids"),
      response: { 200: Type.Array(ref("read")) },
    },
    handler: async (request, reply) => {
      const { params } = request;
      const jobs = await Promise.all(params.ids.map((id) => bullmq.getJob(id)));
      return formatAll(jobs.filter((row) => !!row)) as any;
    },
  });

  app.get("/", {
    schema: {
      querystring: listArgs(ref("filter")),
      response: { 200: Type.Array(ref("read")) },
    },
    preValidation: parseQuery,
    handler: async (request, reply) => {
      const { limit, offset, sort, filter } = request.query;

      const status = filter?.status ?? "failed";

      const total = await bullmq.getJobCountByTypes(status as any);

      reply.header("x-total", total);

      const rows = await bullmq.getJobs(status as any, offset, offset + limit - 1, sort && sort.field === "id" && sort.order === "DESC" ? false : true);

      return formatAll(rows) as any;
    },
  });

  app.put("/", {
    schema: {
      body: ref("create"),
      response: { 200: ref("id") },
    },
    handler: async (request, reply) => {
      const { body } = request;

      let { id, name, data, opts, delayTo } = body;

      opts ??= {};

      if (id) {
        opts.jobId = id;
      }

      if (delayTo) {
        Object.assign(opts, { delay: delayTo.getTime() - Date.now() });
      }

      const job = await bullmq.add(name, data, opts);

      return job as any;
    },
  });

  app.patch("/:id", {
    schema: {
      params: ref("id"),
      body: ref("update"),
      response: { 200: ref("id") },
    },
    handler: async (request, reply) => {
      const { body, params } = request;

      const job = await bullmq.getJob(params.id);

      if (!job) {
        return reply.notFound("TaskNotFound");
      }

      if (Object.hasOwn(body, "data")) {
        await job.updateData(body.data);
      }

      if (body.delayTo) {
        job.changeDelay(body.delayTo.getTime() - Date.now());
      }

      return params;
    },
  });

  app.delete("/:id", {
    schema: {
      params: ref("id"),
      response: { 200: ref("id") },
    },
    handler: async (request, reply) => {
      const { params } = request;

      const job = await bullmq.getJob(params.id);

      if (!job) {
        return reply.notFound("TaskNotFound");
      }

      await job.remove();

      return params;
    },
  });

  app.post("/:ids/retry", {
    schema: {
      summary: ":fa-repeat: retry",
      description: "Attempts to retry the job. Only a job that has failed can be retried.",
      params: ref("ids"),
      response: { 200: Type.Object({ success: Type.Integer(), failed: Type.Integer() }) },
    },
    handler: async (request, reply) => {
      const { ids } = request.params;
      let success = 0;
      let failed = 0;

      for (const id of ids) {
        const job = await bullmq.getJob(id);
        try {
          await job!.retry();
          success += 1;
        } catch {
          failed += 1;
        }
      }

      return { success, failed };
    },
  });

  app.post("/:ids/promote", {
    schema: {
      summary: ":fa-person-running: promote",
      description: "Promotes a delayed job so that it starts to be processed as soon as possible.",
      params: ref("ids"),
      response: { 200: Type.Object({ success: Type.Integer(), failed: Type.Integer() }) },
    },
    handler: async (request, reply) => {
      const { ids } = request.params;
      let success = 0;
      let failed = 0;

      for (const id of ids) {
        const job = await bullmq.getJob(id);
        try {
          await job!.promote();
          success += 1;
        } catch {
          failed += 1;
        }
      }

      return { success, failed };
    },
  });
};

export default plugin;
