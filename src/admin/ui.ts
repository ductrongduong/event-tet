import { Readable } from "node:stream";

import lodash from "lodash";
import { FastifyPluginAsync } from "fastify";

const index: FastifyPluginAsync = async (app, opts) => {
  app.get("/", async (request, reply) => {
    const { search } = new URL(request.url, "https://any");

    const resp = await fetch("https://dl.dir.freefiremobile.com/common/Yn_event/react-admin-next/index.html" + search, {
      method: "GET",
      headers: lodash.omit(request.headers, ["host", "connection"]) as any,
    });

    reply.code(resp.status).headers(resp.headers as any);
    return Readable.fromWeb(resp.body as any);
  });
};

export default index;
