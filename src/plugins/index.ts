import fp from "fastify-plugin";

import sensible from "@fastify/sensible";
import compress from "@fastify/compress";

import cookie from "@grn/fastify-cookie";
import typebox from "@grn/typebox/fastify";

import clients from "@/clients";

export default fp(
  async (app, opts) => {
    app.register(sensible);
    app.register(compress);

    app.register(cookie, {
      secret: process.env.APP_KEY,
      options: globalThis.isTest ? { secure: false } : undefined,
    });

    app.register(typebox);

    app.register(clients);
  },
  { name: "plugins" }
);
