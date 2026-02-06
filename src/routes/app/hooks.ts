import type { onRouteHookHandler, preHandlerAsyncHookHandler, preValidationHookHandler } from "fastify";

import { isEnded } from "@/models/param";

export const splitIdArray: preValidationHookHandler = async (request, reply) => {
  const params = request.params as any;
  const ids: string = params.ids;
  params.ids = ids.length > 0 ? ids.split(",") : [];
};

export const preHandler: preHandlerAsyncHookHandler = async (request, reply) => {
  Object.defineProperty(request, "user", {
    get() {
      return globalThis.getUserFromRequest(request, reply);
    },
  });
};

export const onRoute: onRouteHookHandler = async (routeOptions) => {
  if (routeOptions.method === "POST") {
    const { handler } = routeOptions;

    const handlerWithLock: typeof handler = async function (request, reply) {
      const { user } = request;

      // check if the event has ended
      if (await isEnded()) {
        return reply.forbidden("EventEnded");
      }

      // validate the user
      user.validate();

      // generate the lock key
      const key = ["plock", user.id].join(":");

      // if the lock is not set, return too many requests error
      if ("OK" != (await redis.set(key, 1, "EX", 90, "NX"))) {
        return reply.tooManyRequests();
      }

      try {
        // call the original handler
        return await handler.call(this, request, reply);
      } finally {
        // set the lock to expire
        await redis.pexpire(key, 300, "XX");
      }
    };

    routeOptions.handler = handlerWithLock;
  }
};
