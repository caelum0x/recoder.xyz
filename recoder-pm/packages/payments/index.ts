import "server-only";
import { Polar } from "@polar-sh/sdk";
import { keys } from "./keys";

let _polar: Polar | undefined;

export const polar = new Proxy({} as Polar, {
  get(_, prop, receiver) {
    if (!_polar) {
      _polar = new Polar({
        accessToken: keys().POLAR_ACCESS_TOKEN,
        server:
          (keys().POLAR_SERVER as "production" | "sandbox") || "production",
      });
    }
    const value = Reflect.get(_polar, prop, receiver);
    if (typeof value === "function") {
      return value.bind(_polar);
    }
    return value;
  },
});

export type { Polar } from "@polar-sh/sdk";
