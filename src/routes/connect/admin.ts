import httpErrors from "http-errors";
import { addTags } from "@/utils/tag";
import { FastifyRequest, FastifyReply } from "fastify";
import { Type, FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import * as orm from "drizzle-orm";

import { User } from "@/tables/admin";

const CLIENT_ID = process.env.GOOGLE_AUTH_KEY!;
const CLIENT_SECRET = process.env.GOOGLE_AUTH_SECRET!;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export function authorizationUri(redirectUri: string) {
  let url = new URL(AUTHORIZE_URL);
  let params = url.searchParams;

  params.set("client_id", CLIENT_ID);
  params.set("redirect_uri", redirectUri);
  params.set("response_type", "code");
  params.set("scope", "profile email");

  return url;
}

export async function getAccessTokenFromCode<T = any>(code: string, redirectUri: string) {
  let resp = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  let json = await resp.json();

  return json as T;
}

export async function getUserInfo<T = any>(access_token: string) {
  let url = new URL(USERINFO_URL);
  url.searchParams.set("access_token", access_token);

  let resp = await fetch(url);

  let json = await resp.json();

  return json as T;
}

const ENDPOINT = "/api/admin";
const SESSION_KEY = "ss_admin";
const REDIRECT_TO = "/admin/";

declare global {
  var getAdminFromRequest: (request: FastifyRequest, reply?: FastifyReply) => typeof User._.inferSelect;
}

globalThis.getAdminFromRequest = (request) => {
  try {
    return request.getCookieSecure(SESSION_KEY);
  } catch {
    throw httpErrors.Unauthorized();
  }
};

const index: FastifyPluginAsyncTypebox<{ prefix: string }> = async (app, opts) => {
  const prefix = app.prefix;

  addTags(app, prefix.slice(1));

  function getRedirectUri(req: FastifyRequest) {
    return `${req.protocol}://${req.host}${prefix}/callback`;
  }

  app.get("/", async (req, res) => {
    let redirectUri = getRedirectUri(req);
    let url = authorizationUri(redirectUri);
    res.redirect(url.href);
  });

  app.get(
    "/callback",
    {
      schema: {
        querystring: Type.Object({
          code: Type.String(),
        }),
      },
    },
    async function (req, res) {
      let redirectUri = getRedirectUri(req);

      let { access_token } = await getAccessTokenFromCode(req.query.code, redirectUri);

      let userinfo = await getUserInfo(access_token);

      let { email, name, picture: icon } = userinfo;

      let model = await tableHelper.load(User, email, "email");

      if (!model) {
        return res.forbidden();
      } else {
        const patch = { name, icon };
        await db.update(User).set(patch).where(orm.eq(User.id, model.id));
        Object.assign(model, patch);
      }

      res.setCookieSecure(SESSION_KEY, model, { path: ENDPOINT });

      res.redirect(REDIRECT_TO);
    }
  );

  app.get("/logout", async function (req, res) {
    res.clearCookie(SESSION_KEY, { path: ENDPOINT });
    res.redirect(REDIRECT_TO);
  });
};

export default index;
