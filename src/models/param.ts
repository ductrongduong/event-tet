import { sql } from "drizzle-orm";
import { fmemo } from "@grn/decorators";

import { Param, ErrorMessage } from "@/tables/common";

type TParam = typeof Param._.inferInsert;
type InitValue<T> = T | (() => T | Promise<T>);
type GetSetOpts<T> = Pick<TParam, "type" | "private"> & { value: InitValue<T> };
type GetSetFn = <T = any>(name: string, defaultValue: GetSetOpts<T>) => Promise<T>;

/** Get-set a param */
export const getParam: GetSetFn = fmemo(
  async <T = any>(name: string, opts: GetSetOpts<T>) => {
    let param = await tableHelper.load(Param, name, "name");

    if (!param) {
      let value: any = opts.value;

      if (typeof value === "function") {
        value = await value();
      }

      await db
        .insert(Param)
        .values({ name, type: opts.type, value, private: opts.private })
        .onDuplicateKeyUpdate({ set: { name: sql`VALUES(${Param.name})` } });

      param = await tableHelper.fetch(Param, name, "name");
    }

    switch (param.type) {
      case "datetime":
        param.value = new Date(param.value as string);
        break;

      case "number":
        param.value = Number(param.value);
        break;
    }

    return param.value;
  },
  { prefix: "params", maxAge: 10e3, maxSize: 64, transformArgs: (keys) => [keys[0]] }
) as any;

/** Get a date-time param */
export const getDate = (name: string) => getParam(name, { type: "datetime", value: () => new Date() });

/** Get all error messages */
export const getAllErrorMessages = fmemo(
  async () => {
    const rows = await db
      .select({
        name: ErrorMessage.name,
        message: ErrorMessage.message,
      })
      .from(ErrorMessage)
      .limit(1000);

    return rows.reduce((acc, row) => {
      acc[row.name] = row.message;
      return acc;
    }, {} as Record<string, string>);
  },
  { maxSize: 1, maxAge: 20e3, prefix: "errors" }
);

/** Get the start date-time */
export const getStartTime = (name = "startTime") => getDate(name);

/** Get the end date-time */
export const getEndTime = (name = "endTime") => getDate(name);

/** Check `now` is ended */
export const isEnded = async (name?: string, now = new Date()) => {
  return now >= (await getEndTime(name));
};
