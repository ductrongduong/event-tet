import { Type } from "@sinclair/typebox";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { UserModel } from "@/models/user";

const index: FastifyPluginAsyncTypebox = async (app, opts) => {
  app.post("/:id/impersonate", {
    schema: {
      summary: ":person_search: impersonate",
      description: "Impersonate a user",
      params: Type.Object({ id: Type.Integer({ minimum: 1 }) }),
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = await UserModel.fetch(id);

      globalThis.setUserToCookie(reply, user);
      return { success: true };
    },
  });
};

export default index;
