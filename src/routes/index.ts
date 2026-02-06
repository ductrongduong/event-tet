import { FastifyPluginAsync } from "fastify";

import adminApi from "@/admin";
import adminUi from "@/admin/ui";

import appApi from "./app";
import connect from "./connect";

const index: FastifyPluginAsync = async (app, opts) => {
  app.register(connect, { prefix: "/connect" });

  app.register(appApi, { prefix: "/api/app" });

  app.register(adminUi, { prefix: "/admin" });
  app.register(adminApi, { prefix: "/api/admin" });
};

export default index;
