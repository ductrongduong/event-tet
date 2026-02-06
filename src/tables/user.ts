import * as o from "drizzle-orm";
import * as c from "./columns.helpers";
import * as t from "drizzle-orm/mysql-core";

export const User = t.mysqlTable("User", {
  id: t.int({ unsigned: true }).primaryKey().autoincrement(),
  name: t.varchar({ length: 255 }),
  openid: t.varchar({ length: 32 }).notNull().unique(),
  uid: t.bigint({ mode: "bigint", unsigned: true }).unique(),
  region: t.varchar({ length: 3 }),
  platform: t.tinyint({ unsigned: true }).notNull().default(0),
  ...c.timestamps,
});
