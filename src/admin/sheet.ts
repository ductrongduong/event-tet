import lodash from "lodash";
import { DateTime } from "luxon";

import { Record, Type } from "@sinclair/typebox";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import * as o from "drizzle-orm";

import { AsyncIter } from "@grn/utils/iterator";
import { GoogleCell } from "@grn/google/sheets";

import type { Resource } from "./tables";

type ResourceOptions = Resource & {
  table: any;
};

const plugin: FastifyPluginAsyncTypebox<ResourceOptions> = async (app, opts) => {
  const { name: subject, table } = opts;

  const IMPORT_MAX_SIZE = 10_000;
  const IMPORT_CHUNK_SIZE = 1_000;

  const EXPORT_MAX_SIZE = 100_000;
  const EXPORT_CHUNK_SIZE = 10_000;

  const EXCEL_EPOCH = DateTime.fromISO("1899-12-30T00:00:00");
  const FAILED_COLOR = { red: 255 / 255, green: 99 / 255, blue: 99 / 255, alpha: 0.5 };
  const HEADER_COLOR = { red: 250 / 255, green: 227 / 255, blue: 198 / 255, alpha: 0.5 };
  const SUCCESS_COLOR = { red: 168 / 255, green: 241 / 255, blue: 255 / 255, alpha: 0.5 };

  const columns = o.getTableColumns(table);

  const lockKey = `sheets_${subject}_lock`;

  app.addHook("preHandler", async (request, reply) => {
    const ret = await redis.set(lockKey, 1, "EX", 300, "NX");

    if (ret !== "OK") {
      return reply.tooManyRequests("This sheet has been locked. Plz try again later!");
    }

    reply.raw.once("close", async () => {
      await redis.pexpire(lockKey, 300, "XX");
    });
  });

  app.post("/import", {
    schema: {
      summary: ":add_to_drive: Import (GG Sheet)",
      description: `Import records from the Google Sheet (up to ${IMPORT_MAX_SIZE} rows)`,
      response: {
        200: Type.Object({
          sheetUrl: Type.String({ format: "uri" }),
          totalRows: Type.Integer(),
          successRows: Type.Integer(),
          failedRows: Type.Integer(),
          message: Type.Optional(Type.String()),
        }),
      },
    },
    handler: async (request, reply) => {
      const spreadsheet = await getProjectSpreadsheet();

      const sheet = spreadsheet.sheetByTitle(subject)!;

      if (!sheet) {
        reply.badRequest(`Sheet \`${subject}\` Not Found`);
        return;
      }

      let headerValues: string[];

      {
        const rowData = await sheet.loadCells({ startRowIndex: 0, endRowIndex: 1 });
        const cells = rowData?.[0]?.values ?? [];
        headerValues = cells.map((cell) => cell.formattedValue ?? "");
      }

      const mField = new Map(headerValues.map((key, idx) => [key, idx] as const).filter((val) => !!val[0] && Object.hasOwn(columns, val[0])));
      const mFieldIndex = new Map(Array.from(mField.entries()).map(([key, val]) => [val, key]));

      if (mField.size <= 0) {
        reply.badRequest(`Sheet \`${subject}\` - No database columns were found`);
      }

      const left = Math.min(...mField.values());
      const right = Math.max(...mField.values());
      const rowCount = sheet.rowCount;

      let total = 0;
      let failed = 0;
      let success = 0;

      const injectHeaders = lodash.omit(request.headers, ["content-length"]);

      const CHUNK = IMPORT_CHUNK_SIZE;

      async function* load() {
        for (let top = 1; top <= rowCount; top += CHUNK) {
          const bottom = Math.min(rowCount, top + CHUNK);

          const rowData =
            (await sheet.loadCells({
              startRowIndex: top,
              endRowIndex: bottom,
              startColumnIndex: left,
              endColumnIndex: right + 1,
            })) ?? [];

          for (let i = 0; i < rowData.length; i += 1) {
            const row = top + i;
            const record: Record<string, any> = {};
            const cells: Record<string, GoogleCell> = {};

            let isEmpty = true;

            for (const [key, col] of mField.entries()) {
              const cell = new GoogleCell(sheet, row, col, rowData[row - top]?.values?.[col - left]);

              cells[key] = cell;

              const valueType = cell.valueType;
              const dataType = columns[key].dataType;

              let val: any;

              switch (dataType) {
                case "date": {
                  switch (valueType) {
                    case "numberValue": {
                      val = EXCEL_EPOCH.plus({ days: cell.numberValue }).toJSDate();
                      break;
                    }
                    case "stringValue": {
                      let tmp = DateTime.fromISO(cell.stringValue!);
                      if (tmp.isValid) {
                        val = tmp.toJSDate();
                      }
                      break;
                    }
                  }
                  break;
                }

                case "json": {
                  try {
                    val = JSON.parse(cell.stringValue!);
                    break;
                  } catch {}
                }

                default: {
                  val = cell.value;
                  break;
                }
              }

              record[key] = val;

              if (val !== null && val !== undefined) {
                isEmpty = false;
              }
            }

            if (!isEmpty) {
              yield {
                rowIndex: row,
                record,
                cells,
              };
            }
          }

          if (rowData.length < CHUNK) {
            return;
          }
        }
      }

      await new AsyncIter(load())
        .map(async ({ record: data, cells }) => {
          const resp = await app.inject({
            method: "PUT",
            url: app.prefix,
            body: data,
            headers: injectHeaders,
          });

          total += 1;

          const isError = resp.statusCode !== 200;

          let lCell = Object.values(cells);

          for (const cell of lCell) {
            cell.note = false;
            cell.backgroundColor = isError ? FAILED_COLOR : SUCCESS_COLOR;
          }

          if (isError) {
            failed += 1;

            const json = resp.json();
            const message = json?.message ?? resp.statusMessage;

            let errorField = mFieldIndex.get(left)!;

            if (message.startsWith("body/")) {
              const firstSpace = message.search(/\s+/);
              const firstWord = message.slice(0, firstSpace > 0 ? firstSpace : undefined);
              const tempField = firstWord.split("/")[1];

              if (Object.hasOwn(cells, tempField)) {
                errorField = tempField;
              }
            }

            const cell = cells[errorField];
            cell.note = `[${json?.code ?? resp.statusCode}] ${message}`;
          } else {
            success += 1;
          }

          return lCell;
        })
        .flat()
        .chunk(EXPORT_CHUNK_SIZE)
        .map(async (chunk) => {
          await sheet.saveCells(chunk);
        })
        .consume();

      return {
        totalRows: total,
        failedRows: failed,
        successRows: success,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit?gid=${sheet.sheetId}`,
      };
    },
  });

  app.post("/export", {
    schema: {
      summary: ":fab fa-google-drive: Export (GG Sheet)",
      description: `Export records to the Google Sheet (up to ${EXPORT_MAX_SIZE} rows)`,
      response: {
        200: Type.Object({
          sheetUrl: Type.String({ format: "uri" }),
          totalRows: Type.Integer(),
        }),
      },
    },
    handler: async function (request, reply) {
      const spreadsheet = await getProjectSpreadsheet();

      let lastIdx = -1;
      let sheet = spreadsheet.sheetByTitle(subject);

      const mField = new Map<string, number>();

      if (!sheet) {
        sheet = await spreadsheet.addSheet({ title: subject });
      } else {
        const data = await sheet.loadCells({ startRowIndex: 0, endRowIndex: 1 });
        const cells = data?.[0]?.values ?? [];

        for (let col = 0; col < cells.length; col++) {
          const cell = cells[col];
          const val = cell.formattedValue;
          if (val) {
            if (Object.hasOwn(columns, val)) {
              if (!mField.has(val)) {
                mField.set(val, col);
              }
            }
            lastIdx = col;
          }
        }
      }
      await sheet.clearRows({ start: 2 });

      if (mField.size <= 0) {
        for (const field of Object.keys(columns)) {
          lastIdx += 1;
          mField.set(field, lastIdx);
        }
      }

      if (lastIdx >= sheet.columnCount) {
        await sheet.resize({ columnCount: lastIdx + 1 });
      }

      const schema = table.$inferSelectTypebox;
      const headerCells: GoogleCell[] = [];

      for (const [key, col] of mField.entries()) {
        const cell = new GoogleCell(sheet, 0, col, {} as any);
        cell.value = key;
        cell.textFormat = { bold: true };
        cell.backgroundColor = HEADER_COLOR;
        cell.note = lodash.get(schema, ["properties", key, "description"]) ?? lodash.get(schema, ["properties", key, "items", "description"]) ?? "";
        headerCells.push(cell);
      }

      let total = 0;

      function formatRow(row: Record<string, any>, rowIndex: number) {
        const cells: GoogleCell[] = [];

        for (const key of mField.keys()) {
          const col = mField.get(key)!;

          const cell = new GoogleCell(sheet!, rowIndex, col);
          const val = lodash.get(row, key);

          cell.format = {};

          switch (typeof val) {
            case "bigint":
              cell.value = val.toString();
              break;

            case "object":
              if (val) {
                if (val instanceof Date) {
                  cell.numberFormat = { type: "DATE_TIME", pattern: "yyyy-MM-dd hh:mm:ss" };
                  cell.numberValue = DateTime.fromJSDate(val).diff(EXCEL_EPOCH, "days").as("days");
                } else {
                  cell.stringValue = JSON.stringify(val);
                  cell.wrapStrategy = "WRAP";
                }
              }
              break;

            case "number":
              cell.numberValue = val;
              break;

            case "string":
              cell.stringValue = val;
              cell.wrapStrategy = "WRAP";
              break;

            default: {
              cell.value = val;
            }
          }

          cells.push(cell);
        }

        return cells;
      }

      let idx = 0;

      const valueCells = new AsyncIter(db.select().from(table).limit(EXPORT_MAX_SIZE).iterator())
        .map(async (row) => {
          if (total >= sheet.rowCount) {
            const incrBy = 500;
            await sheet.resize({ rowCount: sheet.rowCount + incrBy });
          }

          total += 1;
          return formatRow(row, ++idx);
        })
        .flat();

      await new AsyncIter(headerCells)
        .concat(valueCells)
        .chunk(EXPORT_CHUNK_SIZE)
        .map(async (chunk) => {
          await sheet.saveCells(chunk);
        })
        .consume();

      return {
        totalRows: total,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit?gid=${sheet.sheetId}`,
      };
    },
  });
};

export default plugin;
