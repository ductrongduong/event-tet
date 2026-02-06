import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { ref } from "./types";
import { addTags } from "@/utils/tag";

const index: FastifyPluginAsyncTypebox = async (app, opts) => {
  addTags(app, "me");

  app.get("", {
    schema: {
      response: { 200: ref("User") },
    },
    handler: async (request, reply) => {
      return request.user;
    },
  });

  app.post("/noop", {
    schema: {
      response: { 200: ref("User") },
      description: "Example endpoint to test the user lock",
    },
    handler: async (request, reply) => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      return request.user;
    },
  });
};

export default index;
