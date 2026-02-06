import * as o from "drizzle-orm";
import * as c from "./columns.helpers";
import * as t from "drizzle-orm/mysql-core";

export const Param = t.mysqlTable("Param", {
  id: t.int({ unsigned: true }).primaryKey().autoincrement(),
  name: t.varchar({ length: 32 }).notNull().unique(),
  type: t.mysqlEnum(["string", "number", "boolean", "object", "richtext", "date", "datetime"]).notNull().default("string"),
  value: t.json().refine({ component: "Dynamic" }),
  private: t.boolean().notNull().default(false),
  description: t.varchar({ length: 255 }),
  ...c.timestamps,
});

export const ErrorMessage = t.mysqlTable("ErrorMessage", {
  id: t.int({ unsigned: true }).primaryKey().autoincrement(),
  name: t.varchar({ length: 64 }).notNull().unique(),
  message: t.varchar({ length: 512 }).notNull().default(""),
  ...c.timestamps,
});
