import { FastifyPluginAsync } from "fastify";

import apidoc from "@grn/fastify-apidoc";

import admin from "./admin";
import garena from "./ff";

const index: FastifyPluginAsync = async (app, opts) => {
  if (globalThis.isTest) {
    app.register(apidoc);
  }

  app.register(admin, { prefix: "/admin" });
  app.register(garena, { prefix: "/garena" });
};

export default index;
