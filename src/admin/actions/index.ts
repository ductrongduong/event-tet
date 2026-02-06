import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

const index: FastifyPluginAsyncTypebox = async (app, opts) => {
  app.register(import("./user"), { prefix: "/user_User" });
};

export default index;
