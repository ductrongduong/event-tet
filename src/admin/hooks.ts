import lodash from "lodash";
import type {
  FastifyInstance,
  onRouteHookHandler,
  onRequestAsyncHookHandler,
  preHandlerAsyncHookHandler,
  preValidationAsyncHookHandler,
  preSerializationAsyncHookHandler,
} from "fastify";

import { getUserCasl } from "./casl";
import { Log } from "@/tables/admin";

const TAG_PATH = ["schema", "tags"];
const ACTION_PATH = ["config", "action"];
const SUBJECT_PATH = ["config", "subject"];

export const getUser: typeof globalThis.getAdminFromRequest = (request, reply) => lodash.get(request, "user") as any;

export const addHooks = (app: FastifyInstance) => {
  app.addHook("onRoute", onRoute.bind(app));

  app.addHook("onRequest", onRequest);

  app.addHook("preValidation", preValidation);

  app.addHook("preHandler", preHandler);

  app.addHook("preSerialization", preSerialization);
};

export const onRequest: onRequestAsyncHookHandler = async function (request, reply) {
  lodash.set(request, "user", getAdminFromRequest(request));
};

export const preValidation: preValidationAsyncHookHandler = async function (request) {
  const { params } = request;

  if (!params) {
    return;
  }

  if (Object.hasOwn(params!, "ids")) {
    const ids: string = lodash.get(params, "ids", "");

    if (!ids.length) {
      throw Error("Ids empty");
    }

    lodash.set(params as any, "ids", ids.split(","));
  }
};

export const onRoute: onRouteHookHandler = function (routeOptions) {
  switch (routeOptions.method) {
    case "HEAD":
    case "OPTIONS":
      return;
  }

  let subject = lodash.get(routeOptions, SUBJECT_PATH);

  let paths: string[];

  if (lodash.isNil(subject)) {
    if (!lodash.get(routeOptions, ["schema", "hide"])) {
      paths = routeOptions.url!.slice(this.prefix.length + 1).split("/");
      subject = paths[0];
      lodash.set(routeOptions, SUBJECT_PATH, subject);
    }
  }

  if (!subject) {
    return;
  }

  const tags = [subject];
  const oldTags: string[] = lodash.get(routeOptions, TAG_PATH);
  let newTags: string[];

  if (Array.isArray(oldTags)) {
    newTags = lodash.uniq(lodash.concat(oldTags, tags));
  } else {
    newTags = tags;
  }

  lodash.set(routeOptions, TAG_PATH, newTags);

  let action = lodash.get(routeOptions, ACTION_PATH);

  if (lodash.isNil(action)) {
    switch (routeOptions.method) {
      case "GET":
        action = "read";
        break;

      case "PUT":
        action = "create";
        break;

      case "PATCH":
        action = "update";
        break;

      case "DELETE":
        action = "delete";
        break;

      case "POST":
        paths ??= routeOptions.url!.slice(this.prefix.length + 1).split("/");
        action = paths[2] ?? paths[1];
        break;
    }

    lodash.set(routeOptions, ACTION_PATH, action);
  }
};

export const preHandler: preHandlerAsyncHookHandler = async function (request, reply) {
  const { routeOptions } = request;
  const subject = lodash.get(routeOptions, SUBJECT_PATH);

  if (!subject) {
    return;
  }

  const action = lodash.get(routeOptions, ACTION_PATH);
  if (!action) {
    return reply.forbidden("EmptyAction");
  }

  const user = getUser(request);
  const casl = await getUserCasl(user.id);

  if (!casl.can(action, subject)) {
    return reply.forbidden(`You can't \`${action}\` the \`${subject}\``);
  }

  if (action !== "read") {
    Object.assign(request, { ctx: { userId: user.id, subject, action } });
  }
};

export const preSerialization: preSerializationAsyncHookHandler = async function (request, reply, payload) {
  const ctx = lodash.get(request, "ctx");

  if (ctx) {
    const { userId, subject, action } = ctx as any;
    await db.insert(Log).values({
      userId: userId,
      action: [subject, action].join("/"),
      args: lodash.merge({ data: request.body }, request.params),
      ret: payload,
    });
  }
};
