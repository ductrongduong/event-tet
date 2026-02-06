// import * as u from "undici";
import { type FastifyInstance } from "fastify";
// import { setGlobalDispatcher, Agent } from "undici";

declare global {
  var isDev: boolean;
  var isTest: boolean;
  var logger: FastifyInstance["log"];
}

// setup undici fetch with http2
// (u as any).install?.();
// setGlobalDispatcher(
//   new Agent({
//     allowH2: true,
//     keepAliveTimeout: 30e3,
//   })
// );

globalThis.isDev = process.env.NODE_ENV === "development";
globalThis.isTest = globalThis.isDev || process.env.NODE_ENV === "staging";

Object.defineProperty(BigInt.prototype, "toJSON", {
  value: function () {
    return this.toString();
  },
});
