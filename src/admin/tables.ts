import lodash from "lodash";
import type { FastifyPluginAsync } from "fastify";
import { getTableName, type Table } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { extractTablesRelationalConfig, createTableRelationsHelpers } from "drizzle-orm";

import * as tableSchema from "@/tables";

import crud from "./crud";
import sheet from "./sheet";

export type Resource = {
  name: string;
  table: Table;
  references?: Record<string, string>;
};

export function resourceScan() {
  const mTableName = new Map<string, string>();
  const mResource = new Map<string, Resource>();

  for (const [prefix, schema] of Object.entries(tableSchema)) {
    const { tables } = extractTablesRelationalConfig(schema, createTableRelationsHelpers);

    for (const [key, config] of Object.entries(tables)) {
      const table = (schema as any)[key];
      const name = [prefix, key].join("_");

      const references: Record<string, string> = {};

      // On foreign-keys
      const { foreignKeys } = getTableConfig(table);
      for (const foreignKey of foreignKeys) {
        const { columns, foreignTable } = foreignKey.reference();
        if (columns.length === 1) {
          const column = columns[0].name;
          references[column] = getTableName(foreignTable);
        }
      }

      // On relations
      for (const relation of Object.values(config.relations)) {
        if (lodash.get(relation, ["constructor", "name"]) === "One") {
          const fields = lodash.get(relation, ["config", "fields"]) as any;
          if (fields?.length === 1) {
            const field = fields[0];
            const referencedTable = relation.referencedTable;
            references[field.name] = getTableName(referencedTable);
          }
        }
      }

      mTableName.set(getTableName(table), name);

      mResource.set(name, {
        name: name,
        table: table,
        references,
      });
    }
  }

  for (const resource of mResource.values()) {
    if (resource.references) {
      for (const [key, val] of Object.entries(resource.references)) {
        resource.references[key] = mTableName.get(val)!;
      }
    }
  }

  return mResource;
}

const plugin: FastifyPluginAsync = async (app, opts) => {
  const resources = resourceScan();

  for (const [name, opts] of resources.entries()) {
    const prefix = "/" + name;

    app.register(crud, { prefix, ...opts });

    if (!!globalThis.getProjectSpreadsheet) {
      app.register(sheet, { prefix, ...opts });
    }
  }
};

export default plugin;
