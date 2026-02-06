import lodash from "lodash";
import { pack, unpack } from "msgpackr";
import { Type, Kind } from "@sinclair/typebox";

import * as o from "drizzle-orm";
import type { Static, TObject, SchemaOptions } from "@sinclair/typebox";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { IsNullable } from "@grn/typebox";

import type { Resource } from "./tables";
import { parseQuery, listArgs } from "./utils";

type ResourceOptions = Resource & { table: any };

const REFERENCE_KEY = "reference";

const plugin: FastifyPluginAsyncTypebox<ResourceOptions> = async (app, opts) => {
  const { name, table } = opts;

  const refName = (key: string) => [name, key].join("_");

  let tRead = lodash.cloneDeep(table.$inferSelectTypebox) as TObject;

  for (const [key, val] of Object.entries(opts.references ?? {})) {
    for (const tschema of [tRead]) {
      lodash.set(tschema, ["properties", key, REFERENCE_KEY], val);
    }
  }

  const ref = <R extends SchemaKey>(k: R, opts?: SchemaOptions) => {
    return Type.Unsafe<Static<Schema[R]>>(Type.Ref(refName(k), opts));
  };

  const refkey = <T extends string>(s: T, opts?: SchemaOptions) => {
    return Type.Ref(refName(`read#/properties/${s}`), opts);
  };

  // infer the filter schema
  const tFilter = Type.Partial(Type.Object({ q: Type.String() }));

  for (const [key, nval] of Object.entries(tRead.properties)) {
    const $ref = refkey(key);
    const [isNullable, val] = IsNullable(nval);

    const setOperation = (o?: string, v: any = $ref) => {
      if (o) {
        lodash.set(tFilter, ["properties", [key, o].join("_")], v);
      } else {
        lodash.set(tFilter, ["properties", key], v);
      }
    };

    switch (val[Kind]) {
      case "Number":
      case "Integer":
      case "BigInt":
        setOperation();

      case "Date":
        setOperation("lte");
        setOperation("gte");
        break;

      case "String":
        switch (val.format) {
          case "date":
            setOperation();
          case "date-time":
            setOperation("lte");
            setOperation("gte");
            break;

          default:
            setOperation();
            setOperation("has", Type.String());
            break;
        }

        break;

      case "Boolean":
        setOperation();
        break;
    }

    if (key === "id" || (Object.hasOwn(val, REFERENCE_KEY) && val.type !== "array") || val.enum?.length > 0) {
      setOperation("in", Type.Array($ref));
    }

    if (isNullable) {
      setOperation("isNull", Type.Boolean());
    }
  }

  const tCreate = Type.Object({});
  const tUpdate = Type.Object({});
  const tInsert = table.$inferInsertTypebox;

  // infer the update & insert schemas
  for (const [key, val] of Object.entries(tInsert.properties)) {
    if (lodash.get(val, "readOnly")) {
      lodash.unset(tRead, ["properties", key, "readOnly"]);
      continue;
    }
    lodash.set(tUpdate, ["properties", key], refkey(key));
    lodash.set(tCreate, ["properties", key], refkey(key, lodash.pick(val, ["default"])));
  }
  lodash.set(tCreate, "required", lodash.get(tInsert, "required"));

  const idConfig = tableHelper.idConfig(table);
  let entityView: (v: any) => any = (v) => v;
  let parseIdValue: (v: any) => any = (v) => v;

  if ((idConfig as any).id !== "id") {
    tRead = Type.Composite([Type.Object({ id: Type.String() }), tRead]);

    // add virtual id column
    entityView = (val) => lodash.set(val, "id", pack(idConfig.value(val)).toString("base64url"));
    parseIdValue = (val) => {
      try {
        return unpack(Buffer.from(val, "base64url"));
      } catch {
        throw Object.assign(Error("Invalid Id Value"), { statusCode: 400 });
      }
    };
  }

  const schema = {
    read: tRead,
    create: tCreate,
    update: tUpdate,
    filter: tFilter,
  };

  type Schema = typeof schema;
  type SchemaKey = keyof Schema;

  const tIds = Type.Array(refkey("id"));
  const tIdsObject = Type.Object({ ids: tIds });

  for (const [key, val] of Object.entries(schema)) {
    app.addSchema({ ...val, $id: refName(key) });
  }

  app.get("/:ids", {
    schema: {
      params: tIdsObject,
      response: { 200: Type.Array(ref("read")) },
    },
    handler: async (request, reply) => {
      const ids = request.params.ids.map(parseIdValue);
      const rows = await tableHelper.loadMany(table, ids);
      return rows.filter((row) => !!row).map(entityView);
    },
  });

  app.get("/", {
    schema: {
      querystring: listArgs(ref("filter")),
      response: { 200: Type.Array(ref("read")) },
    },
    preValidation: parseQuery,
    handler: async (request, reply) => {
      const { limit, offset, sort, filter } = request.query;

      let qFilter: any;

      if (filter) {
        const listOp = [];

        for (const [key, val] of Object.entries(filter as Record<string, any>)) {
          let field: string = key;
          let op: string | undefined;

          if (key === "q") {
            op = "has";
            field = ["name", "title", "id"].find((col) => Object.hasOwn(table, col))!;

            if (!field) {
              continue;
            }
          } else {
            const arr = key.split("_");
            if (arr.length >= 2) {
              op = arr[arr.length - 1];
              field = arr.slice(0, -1).join("_");
            } else {
              op = "eq";
            }
          }

          if (Object.hasOwn(table, field)) {
            switch (op) {
              case "eq":
              case "gt":
              case "lt":
              case "gte":
              case "lte":
              case "like":
                listOp.push(o[op](table[field], val));
                break;

              case "in":
                listOp.push(o.inArray(table[field], Array.isArray(val) ? val : [val]));
                break;

              case "has":
                if (val) {
                  listOp.push(o.like(table[field], `%${(val as any).replace(/([\_\%])/g, "\\$1")}%`));
                }
                break;

              case "isNull":
                switch (val) {
                  case true:
                    listOp.push(o.isNull(table[field]));
                    break;

                  case false:
                    listOp.push(o.isNotNull(table[field]));
                    break;
                }
                break;
            }
          } else if (Object.hasOwn(table, key)) {
            listOp.push(o.eq(table[key], val));
          }
        }

        if (listOp.length > 0) {
          qFilter = o.and(...listOp);
        }
      }

      let total: number;

      if (!qFilter) {
        const tbname = o.getTableName(table);
        const dbname = lodash.get(slave, ["$client", "pool", "config", "connectionConfig", "database"]);

        const [result] = await slave.execute(
          o.sql`select TABLE_ROWS as tr from INFORMATION_SCHEMA.TABLES where TABLE_SCHEMA = ${dbname} and TABLE_NAME = ${tbname} limit ${1}`
        );

        const tableRows = lodash.get(result, [0, "tr"]);

        if (tableRows > 100_000) {
          total = tableRows;
        }
      }

      total ??= await slave.$count(table, qFilter);

      reply.header("x-total", total);

      const query = db.select().from(table).where(qFilter).$dynamic();

      if (sort && Object.hasOwn(table, sort.field)) {
        query.orderBy(o[sort.order === "ASC" ? "asc" : "desc"](table[sort.field]));
      }

      const rows = await query.limit(limit).offset(offset);

      return rows.map(entityView);
    },
  });

  app.put("/", {
    schema: {
      body: ref("create"),
      response: { 200: ref("read") },
    },
    handler: async (request, reply) => {
      const body = request.body as any;

      const patch = Object.fromEntries(Object.keys(body).map((key) => [key, o.sql`values(${table[key]})`]));

      const [{ insertId }] = await db.insert(table).values(body).onDuplicateKeyUpdate({ set: patch });

      const row = await tableHelper.load(table, insertId != 0 ? insertId : idConfig.value(body) || insertId);

      return entityView(row);
    },
  });

  app.patch("/:ids", {
    schema: {
      params: tIdsObject,
      body: ref("update"),
      response: { 200: tIds },
    },
    handler: async (request, reply) => {
      const { body, params } = request;
      const ids = params.ids.map((id) => parseIdValue(id));
      await db
        .update(table)
        .set(body as any)
        .where(o.inArray(idConfig.field, ids));
      return params.ids;
    },
  });

  app.delete("/:ids", {
    schema: {
      params: tIdsObject,
      response: { 200: tIds },
    },
    handler: async (request, reply) => {
      const { params } = request;
      const ids = params.ids.map((id) => parseIdValue(id));
      await db.delete(table).where(o.inArray(idConfig.field, ids));
      return params.ids;
    },
  });
};

export default plugin;
