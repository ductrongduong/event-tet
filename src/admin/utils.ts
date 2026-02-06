import { parse } from "qs";
import lodash from "lodash";
import { EnumString } from "@grn/typebox";
import type { FastifyRequest } from "fastify";
import { Type, type TSchema, type TAny } from "@sinclair/typebox";

export async function parseQuery(request: FastifyRequest) {
  const { search } = new URL(request.url, "https://any");
  const query = parse(search.slice(1), { comma: true });
  lodash.set(request, "query", query);
}

export function listArgs<T extends TSchema = TAny>(filter: T) {
  return Type.Object(
    {
      limit: Type.Integer({ default: 10, minimum: 1, maximum: 10_000 }),
      offset: Type.Integer({ default: 0, minimum: 0 }),
      sort: Type.Optional(
        Type.Object({
          field: Type.String(),
          order: EnumString(["ASC", "DESC"], { default: "ASC" }),
        })
      ),
      filter: Type.Optional(filter),
    },
    {
      style: "deepObject",
    }
  );
}
