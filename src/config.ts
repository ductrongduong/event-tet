import dotenv from "@dotenvx/dotenvx";

dotenv.config({
  overload: true,
  path: process.env.ENV_PATH ?? ".env",
});
