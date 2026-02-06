import * as o from "drizzle-orm";
import * as c from "./columns.helpers";
import * as t from "drizzle-orm/mysql-core";

import { Type } from "@sinclair/typebox";

import { EnumNumber } from "@grn/typebox";

export const ROLES = {
  LOCK: 0,
  GUEST: 1,
  STAFF: 16,
  ADMIN: 32,
  SUPER: 64,
} as const;

const tRole = EnumNumber(ROLES);

export const tRules = Type.Array(
  Type.Object({
    subject: Type.Union([Type.String(), Type.Array(Type.String())]),
    action: Type.Union([Type.String(), Type.Array(Type.String())]),
    inverted: Type.Optional(Type.Boolean()),
  })
);

export const User = t.mysqlTable("admin_User", {
  id: t.int({ unsigned: true }).primaryKey().autoincrement(),
  name: t.varchar({ length: 255 }),
  email: t.varchar({ length: 255 }).notNull().unique().refine({ format: "email" }),
  icon: t.text(),
  role: t.tinyint({ unsigned: true }).notNull().default(0).typebox(tRole),
  groupIds: t
    .json()
    .typebox(Type.Array(Type.Integer({ minimum: 0, maximum: 1e6 }), { uniqueItems: true }))
    .refine({ reference: "admin_Group" }),
  ...c.timestamps,
});

export const Group = t.mysqlTable("admin_Group", {
  id: t.int({ unsigned: true }).primaryKey().autoincrement(),
  name: t.varchar({ length: 64 }).notNull().unique(),
  rules: t.json().typebox(tRules),
  ...c.timestamps,
});

export const Log = t.mysqlTable(
  "admin_Log",
  {
    id: t.int({ unsigned: true }).primaryKey().autoincrement(),
    userId: t.int({ unsigned: true }).notNull().refine({ reference: "admin_User" }),
    action: t.varchar({ length: 64 }).notNull(),
    args: t.json(),
    ret: t.json(),
    ...c.createdAt,
  },
  (table) => [t.index("userid_idx").on(table.userId)]
);
