import type { FastifyPluginAsync } from "fastify";

import { Type } from "@sinclair/typebox";
import { User, tRules } from "@/tables/admin";

import apidoc from "@grn/fastify-apidoc";

import { getUserRules } from "./casl";
import { getUser, addHooks } from "./hooks";

import tables from "./tables";
import task from "./bullmq/task";
import crontask from "./bullmq/crontask";
import actions from "./actions";

const index: FastifyPluginAsync = async (app, opts) => {
  app.register(apidoc);

  addHooks(app);

  app.get("/me", {
    schema: {
      response: { 200: Type.Pick(User.$inferSelectTypebox, ["id", "name", "icon", "email"]) },
    },
    config: { subject: "" },
    handler: async (request, reply) => {
      return getUser(request);
    },
  });

  app.get("/casl", {
    schema: {
      response: { 200: tRules },
    },
    config: { subject: "" },
    handler: async (request, reply) => {
      const user = getUser(request);
      return getUserRules(user.id);
    },
  });

  // resources
  app.register(tables);

  // tasks
  app.register(task, { prefix: "/task_Task" });
  app.register(crontask, { prefix: "/task_CronTask" });

  // actions
  app.register(actions);
};

export default index;
