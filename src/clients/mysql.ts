import { Logger } from "drizzle-orm/logger";
import { createPool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";

import { TableHelper, BaseModel } from "@grn/drizzle";

type Mysql = ReturnType<typeof createDrizzleClient>;

declare global {
  var db: Mysql;
  var slave: Mysql;
  var master: Mysql;
  var tableHelper: TableHelper;
}

class MyLogger implements Logger {
  constructor(public name: string) {}

  logQuery(query: string, params: unknown[]): void {
    logger.info({ msg: `[${this.name}] ${query}`, params });
  }
}

function createClient(uri: string) {
  const client = createPool({
    uri,
    timezone: "Z",
    charset: "utf8mb4",
    connectionLimit: 32,
    idleTimeout: 600_000,
    dateStrings: ["DATE"],
    supportBigNumbers: true,
  });

  const vars: Record<string, string> = {
    time_zone: "+00:00",
    "@@sql_mode": "ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION",
    // transaction_isolation: "READ-UNCOMMITTED",
  };

  client.on("connection", (conn) => {
    conn.query(
      `SET ${Object.keys(vars)
        .map((key) => `${key} = ?`)
        .join(", ")}`,
      Object.values(vars)
    );
  });

  return client;
}

function createDrizzleClient(uri: string, name: string = "master") {
  return drizzle({
    mode: "default",
    client: createClient(uri),
    logger: globalThis.logger && globalThis.isDev ? new MyLogger(name) : false,
  });
}

export async function create() {
  const { DATABASE_URL, DATABASE_SLAVE_URL } = process.env;

  const master = createDrizzleClient(DATABASE_URL ?? "mysql://root@localhost/sample_drizzle_db");
  const slave = !!DATABASE_SLAVE_URL ? createDrizzleClient(DATABASE_SLAVE_URL, "slave") : master;

  globalThis.db = master;
  globalThis.slave = slave;
  globalThis.master = master;

  globalThis.tableHelper = new TableHelper(master);

  BaseModel.helper = tableHelper;

  return master;
}

export async function destroy() {
  Promise.all([globalThis.master.$client.end(), globalThis.slave.$client.end()]).catch((err) => logger.error(err));
}
