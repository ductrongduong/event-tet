import lodash from "lodash";
import httpErrors from "http-errors";
import { pack, unpack } from "msgpackr";
import { FastifyReply, FastifyRequest } from "fastify";
import { Type, FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { addTags } from "@/utils/tag";
import { UserModel } from "@/models/user";

import { chance } from "@grn/utils/chance";
import { generateUri, requestGet, requestPost } from "./utils";

const APP_SECRET = process.env.GARENA_APP_SERET;
const APP_ID = Number.parseInt(process.env.GARENA_APP_ID ?? "100067");
const OAUTH_BASE = process.env.OAUTH_BASE || `https://auth.garena.com/oauth/`;

const AUTHORIZE_URL = new URL("login", OAUTH_BASE);

const API_PATH = "/";
const SESSION_KEY = "ff_session";

declare global {
  var setUserToCookie: (reply: FastifyReply, user: any) => void;
  var getUserFromRequest: (request: FastifyRequest, reply?: FastifyReply) => UserModel;
}

globalThis.getUserFromRequest = (request, reply) => {
  reply?.header("cache-control", "no-cache");

  try {
    return UserModel.fromJson(request.getCookieSecure(SESSION_KEY));
  } catch {
    throw httpErrors.Unauthorized();
  }
};

globalThis.setUserToCookie = (reply, user) => {
  reply.setCookieSecure(SESSION_KEY, user, { path: API_PATH });
};

const index: FastifyPluginAsyncTypebox<{ prefix: string }> = async function (app, opts) {
  const prefix = app.prefix;

  addTags(app, prefix.slice(1));

  function getForwardUri(request: FastifyRequest) {
    return `${request.protocol}://${request.host}/`;
  }

  function getRedirectUri(request: FastifyRequest) {
    return `${request.protocol}://${request.host}${prefix}/callback`;
  }

  function authorizationUri(request: FastifyRequest, params: Record<string, any>) {
    lodash.defaults(params, {
      client_id: APP_ID,
      response_type: APP_SECRET ? "code" : "token",
      redirect_uri: getRedirectUri(request),
    });
    return generateUri(AUTHORIZE_URL, params);
  }

  function authorizationCode(request: FastifyRequest, code: string) {
    return getTokenFromCode(code, getRedirectUri(request));
  }

  function encodeState(req: FastifyRequest) {
    let { next } = req.query as any;
    next ||= req.headers["referer"];
    return pack({ next }).toString("base64url");
  }

  function decodeState(req: FastifyRequest) {
    let { state } = req.query as any;
    return state ? unpack(Buffer.from(state, "base64url")) : null;
  }

  app.get("/", {
    schema: {
      querystring: Type.Object({
        platform: Type.Integer({ default: 3 }),
      }),
    },
    async handler(request, reply) {
      const { platform } = request.query;
      const url = authorizationUri(request, { platform, state: encodeState(request) });
      return reply.redirect(url.href);
    },
  });

  app.get("/callback", {
    schema: {
      querystring: Type.Partial(
        Type.Object({
          code: Type.String(),
          state: Type.String(),
          access_token: Type.String(),
          garena_token: Type.String(),
        })
      ),
    },
    async handler(request, reply) {
      let { access_token: accessToken, garena_token: garenaToken, code } = request.query;
      let info: UserInfo;

      if (!accessToken) {
        if (garenaToken) {
          const { decryptToken } = await import("@grn/freefire/token");
          accessToken = decryptToken(garenaToken);
        } else if (code) {
          info = await authorizationCode(request, code);
          info.app_id ??= APP_ID;
          accessToken = info.access_token!;
        }
      }

      if (!accessToken) {
        return reply.badRequest("Empty AccessToken");
      }

      info ??= await inspectToken(accessToken);

      let { open_id: openid, platform } = info;

      if (!openid) {
        throw httpErrors.BadRequest("Empty OpenID");
      }

      if (info.app_id != APP_ID) {
        return reply.badRequest("Invalid App_id");
      }

      let user = await UserModel.$upsert({ openid, platform, accessToken });

      user.accessToken = accessToken;
      globalThis.setUserToCookie(reply, user);

      let next = new URL(`${request.protocol}://${request.host}`);

      try {
        let json = decodeState(request);
        let tmp = new URL(json.next);
        if (tmp.host === next.host) {
          next = tmp;
        }
      } catch {}

      return reply.redirect(next.href);
    },
  });

  app.get("/logout", async (request, reply) => {
    const forwardUrl = getForwardUri(request);

    let next: string = forwardUrl;

    try {
      const user = getUserFromRequest(request);

      let { accessToken } = user;
      if (!accessToken) {
        throw Error("EmptyAccessToken");
      }

      let { error } = await inspectToken(accessToken);

      if (error) {
        throw Error("InvalidAccessToken");
      }

      let logoutUrl = new URL("logout", OAUTH_BASE);
      logoutUrl.searchParams.append("format", "redirect");
      logoutUrl.searchParams.append("redirect_uri", forwardUrl);
      logoutUrl.searchParams.append("access_token", accessToken);

      next = logoutUrl.href;
    } catch {
      // next = forwardUrl;
    } finally {
      reply.clearCookie(SESSION_KEY, { path: API_PATH });
      reply.redirect(next);
    }
  });

  if (globalThis.isTest) {
    app.route({
      url: "/random",
      method: "POST",
      async handler(request, reply) {
        const openid = "test_" + chance.integer({ min: 1e9, max: 10e9 - 1 });
        const user = await UserModel.upsert({ name: openid, openid, platform: 111 }, "openid");

        reply.header("cache-control", "no-cache");
        globalThis.setUserToCookie(reply, user);

        return user;
      },
    });
  }
};

export default index;

type UserInfo = {
  uid: number;
  open_id: string;
  platform: number;
  nickname?: string;
  app_id?: number;
  error?: any;
  access_token?: string;
  refresh_token?: string;
};

function getUserInfo(access_token: string) {
  return requestGet<UserInfo>(new URL("user/info/get", OAUTH_BASE), { access_token });
}

function inspectToken(token: string) {
  return requestGet<UserInfo>(new URL("token/inspect", OAUTH_BASE), { token });
}

function getTokenFromCode(code: string, redirect_uri: string) {
  return requestPost<UserInfo>(new URL("token", OAUTH_BASE), {
    code,
    redirect_uri,
    client_id: APP_ID,
    client_secret: APP_SECRET,
    grant_type: "authorization_code",
  });
}
