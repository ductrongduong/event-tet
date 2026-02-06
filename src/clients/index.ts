import type { Promisable } from "type-fest";
import { FastifyPluginAsync } from "fastify";

type Client = {
  create: () => Promisable<any>;
  destroy: () => Promisable<any>;
};

type Clientable = Promise<Client>;

const plugin: FastifyPluginAsync = async (app, opts) => {
  globalThis.logger = app.log;

  const clients: Array<Clientable> = [
    // list of client
    import("./mysql"),
    import("./bullmq"),
    import("./sheet"),
  ];

  await Promise.all(
    clients.map((client) => {
      app.addHook("onClose", async () => {
        return client
          .then((module) => module.destroy())
          .catch((err: any) => {
            logger.error(err);
          });
      });

      return client
        .then((module) => module.create())
        .catch((err: any) => {
          logger.error(err);
        });
    })
  );
};

export default plugin;
