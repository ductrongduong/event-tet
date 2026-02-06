import Redis from "ioredis";
import type { RedisOptions } from "ioredis";

declare global {
  var redis: Redis;
}

export function urlToRedisConfig(url: URL | string, opts?: RedisOptions) {
  if (!(url instanceof URL)) {
    url = new URL(url);
  }

  const params = url.searchParams;

  let prefix = params.get("prefix");

  if (prefix && !prefix.endsWith(":")) {
    prefix += ":";
  }

  const db = url.pathname.slice(1);

  let config: RedisOptions = {
    // host + port
    host: url.hostname || undefined,
    port: url.port ? parseInt(url.port) : undefined,

    // user + pass
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,

    // db
    db: db ? parseInt(db) : undefined,

    // prefix
    keyPrefix: prefix!,
  };

  if (opts) {
    config = Object.assign(opts, config);
  }

  return config;
}

export async function create() {
  const conn = process.env.REDIS_URL ?? "redis:///?prefix=dev";
  const opts = urlToRedisConfig(conn, {
    lazyConnect: true,
    enableAutoPipelining: true,
  });
  globalThis.redis = new Redis(opts);
}

export async function destroy() {
  await redis.quit();
}
