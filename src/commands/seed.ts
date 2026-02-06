import "@/config";

import { DateTime } from "luxon";

import * as o from "drizzle-orm";
import { create, destroy } from "@/clients/mysql";

import { Reward } from "@/tables/reward";

async function main() {
  try {
    create();

    const db = globalThis.db;

    await db
      .insert(Reward)
      .values(
        Array(10)
          .fill(1)
          .map((_, idx) => {
            const id = idx + 1;
            return {
              id,
              name: `Item ${id}`,
            };
          })
      )
      .onDuplicateKeyUpdate({ set: { id: o.sql`id` } });
  } finally {
    destroy();
  }
}

main();
