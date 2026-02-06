import apidoc from "@grn/fastify-apidoc";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { schema } from "./types";
import { preHandler, onRoute } from "./hooks";

import me from "./me";
import param from "./param";

const index: FastifyPluginAsyncTypebox = async (app, opts) => {
  if (globalThis.isTest) {
    app.register(apidoc);
  }

  for (const val of Object.values((schema as any).$defs)) {
    app.addSchema(val);
  }

  app.addHook("onRoute", onRoute);
  app.addHook("preHandler", preHandler);

  app.register(param);

  app.register(me, { prefix: "/me" });
};

export default index;
