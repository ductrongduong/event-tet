import { Type } from "@sinclair/typebox";
import type { Static, SchemaOptions, TModule, TImport } from "@sinclair/typebox";

import { User } from "@/tables/user";

import { UserModel } from "@/models/user";

declare module "fastify" {
  interface FastifyRequest {
    user: UserModel;
  }
}

export const schema = Type.Module({
  Id: Type.Object({ id: Type.Integer({ minimum: 0 }) }),
  Ids: Type.Object({ ids: Type.Array(Type.Integer({ minimum: 0 })) }),

  User: Type.Pick(User.$inferSelectTypebox, ["id", "name", "uid"]),
});

type Props = typeof schema extends TModule<infer C> ? C : never;

export type Ref<K extends keyof Props> = Static<TImport<Props, K>>;

export function ref<K extends keyof Props>(key: K, opts?: SchemaOptions) {
  return Type.Unsafe<Ref<K>>(Type.Ref(key, opts));
}