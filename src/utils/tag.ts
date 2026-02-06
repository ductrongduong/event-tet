import lodash from "lodash";
import { type FastifyInstance } from "fastify";

export const addTags = <App extends FastifyInstance>(app: App, tags: string | string[]) => {
  if (!Array.isArray(tags)) {
    tags = [tags];
  }

  const TAG_PATH = ["schema", "tags"];

  app.addHook("onRoute", (routeOptions) => {
    switch (routeOptions.method) {
      case "HEAD":
      case "OPTIONS":
        return;
    }

    let oldTags: string[] = lodash.get(routeOptions, TAG_PATH);
    let newTags: string[];

    if (Array.isArray(oldTags)) {
      newTags = lodash.uniq(lodash.concat(oldTags, tags));
    } else {
      newTags = tags;
    }

    lodash.set(routeOptions, TAG_PATH, newTags);
  });

  return app;
};
