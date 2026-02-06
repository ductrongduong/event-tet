import lodash from "lodash";
import { Type } from "@sinclair/typebox";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import type { JobSchedulerJson } from "bullmq";
import type { Static } from "@sinclair/typebox";

import { TASK_NAMES } from "./task";
import { parseQuery, listArgs } from "../utils";

const plugin: FastifyPluginAsyncTypebox = async (app, opts) => {
  const name = "task_CronTask";

  const refName = (key: string) => [name, key].join("_");

  const tRead = Type.Object({
    id: Type.String(),
    name: Type.String(),
    pattern: Type.String(),
    endDate: Type.Optional(Type.Date()),
    taskId: Type.Optional(Type.String({ foreign: "task_Task" })),
    next: Type.Optional(Type.Date()),
    limit: Type.Optional(Type.Integer()),
  });

  const tCreate = Type.Object({
    id: Type.Optional(Type.String()),
    name: Type.String({ enum: TASK_NAMES }),
    data: Type.Optional(Type.Any()),
    opts: Type.Optional(Type.Any()),
    pattern: Type.String(),
    endDate: Type.Optional(Type.Date()),
    limit: Type.Optional(Type.Integer({ minimum: 1 })),
  });

  const tUpdate = Type.Object({
    pattern: Type.Optional(Type.String()),
    endDate: Type.Optional(Type.Date()),
    limit: Type.Optional(Type.Integer({ minimum: 1 })),
  });

  const schema = {
    id: Type.Pick(tRead, ["id"]),
    ids: Type.Object({ ids: Type.Array(Type.Index(tRead, ["id"])) }),
    read: tRead,
    create: tCreate,
    update: tUpdate,
  };

  type Schema = typeof schema;
  type SchemaKey = keyof Schema;

  const ref = <R extends SchemaKey>(k: R) => {
    return Type.Unsafe<Static<Schema[R]>>(Type.Ref(refName(k)));
  };

  for (const [key, val] of Object.entries(schema)) {
    lodash.set(val, "$id", refName(key));
    app.addSchema(val);
  }

  const format = async (job: JobSchedulerJson) => {
    if (!lodash.get(job, "id")) {
      job.id = job.key;
    }

    let { next, endDate } = job;

    if (next) {
      lodash.set(job, "taskId", ["repeat", job.id, job.next].join(":"));
      lodash.set(job, "next", new Date(next));
    }

    if (endDate) {
      lodash.set(job, "endDate", new Date(endDate));
    }

    return lodash.pick(job, "id", "name", "pattern", "endDate", "taskId", "next", "limit");
  };

  const formatAll = async (jobs: JobSchedulerJson[]) => {
    return Promise.all(jobs.map((job) => format(job)));
  };

  app.get("/:ids", {
    schema: {
      params: ref("ids"),
      response: { 200: Type.Array(ref("read")) },
    },
    handler: async (request, reply) => {
      const { params } = request;
      const jobs = await Promise.all(params.ids.map((id) => bullmq.getJobScheduler(id)));
      return formatAll(jobs.filter((job) => !!job)) as any;
    },
  });

  app.get("/", {
    schema: {
      querystring: listArgs(Type.Object({})),
      response: { 200: Type.Array(ref("read")) },
    },
    preValidation: parseQuery,
    handler: async (request, reply) => {
      const { limit, offset, sort } = request.query;

      const total = await bullmq.getJobSchedulersCount();

      reply.header("x-total", total);

      const rows = await bullmq.getJobSchedulers(offset, offset + limit - 1, sort && sort.field === "id" && sort.order === "DESC" ? false : true);

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

      let { id, name, data, pattern, endDate, limit } = body;

      opts ??= {};

      if (!id) {
        const client = await bullmq.client;
        id = (await client.incr([bullmq.keys.repeat, "id"].join(":"))).toString();
      }

      await bullmq.upsertJobScheduler(id, { pattern, endDate, limit }, { name, data, opts });

      return { id };
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

      const { id } = params;
      const job = await bullmq.getJobScheduler(id);

      if (!job || !job.template) {
        return reply.notFound("TaskNotFound");
      }

      const keys = ["pattern", "endDate", "limit", "count"];

      const patch = lodash.pick(body, keys);

      if (Object.keys(patch).length > 0) {
        const repeat = lodash.merge(lodash.pick(job, keys), patch);
        await bullmq.upsertJobScheduler(id, repeat as any, { name: job.name, ...job.template });
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
      await bullmq.removeJobScheduler(params.id);
      return params;
    },
  });
};

export default plugin;
