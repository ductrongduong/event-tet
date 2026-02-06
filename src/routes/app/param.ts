import lodash from "lodash";
import { DateTime } from "luxon";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { splitIdArray } from "./hooks";

import { Param } from "@/tables/common";
import { getDate, getAllErrorMessages } from "@/models/param";

const index: FastifyPluginAsyncTypebox = async (app, opts) => {
  app.get("/param/:ids", {
    schema: {
      tags: ["Common"],
      description: "Common params",
      params: Type.Object({ ids: Type.Array(Type.String()) }),
      response: {
        200: Type.Partial(
          Type.Object(
            {
              current: Type.String({ format: "date-time" }),
              errors: Type.Record(Type.String(), Type.String()),
            },
            { additionalProperties: true }
          )
        ),
      },
    },
    preValidation: splitIdArray,
    handler: async (request, reply) => {
      const { ids } = request.params;
      const idset = new Set(ids);

      const params: Record<string, any> = {};

      if (idset.has("current")) {
        params.current = DateTime.now().toISO();
        idset.delete("current");
      }

      if (idset.has("errors")) {
        params.errors = await getAllErrorMessages();
        idset.delete("errors");
      }

      if (idset.size > 0) {
        const rows = await tableHelper.loadCacheMany(Param, Array.from(idset), "name");

        for (const row of rows) {
          if (row && !row.private) {
            params[row.name] = row.value;
          }
        }
      }

      return params;
    },
  });
};

export default index;
