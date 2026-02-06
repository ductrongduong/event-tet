import Fastify from "fastify";
import closeWithGrace from "close-with-grace";

import typeboxAjv from "@grn/typebox/ajv";

import "@/config";
import "@/patch";

import plugins from "@/plugins";

export async function main() {
  const app = Fastify({
    logger: {
      level: globalThis.isDev ? "trace" : "info",
      transport: globalThis.isDev
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              ignore: "pid,hostname",
            },
          }
        : undefined,
    },
    ajv: {
      customOptions: {
        strict: true,
        removeAdditional: "all",
        keywords: [
          // openapi
          "style",
          "explode",
          // admin
          "reference",
          "component",
          // x-plugin
          "x-enum-varnames",
          "x-enum-descriptions",
          "x-enumDescriptions",
        ],
      },
      plugins: [typeboxAjv],
    },
    trustProxy: true,
    disableRequestLogging: !globalThis.isDev,
    routerOptions: {
      maxParamLength: 1024,
    },
    http2: (process.env.HTTP2 === "true") as any,
  });

  if (!globalThis.isDev) {
    app.addHook("onError", async (request, reply, error) => {
      const statusCode = error.statusCode ?? 500;
      if (statusCode >= 500) {
        app.log.error(Object.assign(error, { method: request.method, url: request.url, ip: request.ip, statusCode }));
      }
    });
  }

  // Init plugins
  app.register(plugins);

  // Declare a route
  app.register(import("@/routes"));

  // Run the server!
  try {
    process.on("unhandledRejection", (reason) => {
      console.error(reason);
    });

    closeWithGrace({ delay: parseInt(process.env.FASTIFY_CLOSE_GRACE_DELAY ?? "500") }, async function ({ signal, err, manual }) {
      if (err) {
        app.log.error(err);
      }
      await app.close();
    } as closeWithGrace.CloseWithGraceAsyncCallback);

    await app.listen({
      host: process.env.HOST,
      port: (process.env.PORT as any) ?? 8001,
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
