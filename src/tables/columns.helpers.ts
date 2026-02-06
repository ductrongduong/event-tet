import { $refine } from "@grn/drizzle";

import * as o from "drizzle-orm";
import * as t from "drizzle-orm/mysql-core";

// noop
(function () {
  const _ = $refine;
})();

export const createdAt = {
  createdAt: t
    .datetime()
    .notNull()
    .default(o.sql`CURRENT_TIMESTAMP`)
    .refine({ readOnly: true }),
};

export const updatedAt = {
  updatedAt: t
    .datetime()
    .notNull()
    .default(o.sql`CURRENT_TIMESTAMP`)
    .$onUpdate(() => new Date())
    .refine({ readOnly: true }),
};

export const timestamps = { ...createdAt, ...updatedAt };
