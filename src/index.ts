import cluster from "node:cluster";
import { availableParallelism } from "node:os";

import { main } from "./main";

async function start() {
  const clusterEnv = process.env.NODE_CLUSTER;

  if (!!clusterEnv) {
    // start server in cluster mode
    if (cluster.isPrimary) {
      const max = availableParallelism();

      let n = parseInt(clusterEnv);

      if (Number.isInteger(n)) {
        n = Math.min(Math.max(n, 1), max);
      } else {
        n = max;
      }

      for (let i = 0; i < n; i++) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(Error("fork timeout"));
          }, 60_000);

          cluster
            .fork()
            .once("listening", () => {
              resolve(null);
              clearTimeout(timeout);
            })
            .once("error", (err) => {
              reject(err);
              clearTimeout(timeout);
            });
          // .once("exit", (code) => {
          //   if (code !== 0) {
          //     process.exit(code);
          //   }
          // })
        });
      }

      return;
    }
  }

  await main();
}

start();
