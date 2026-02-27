import { beforeAll, afterEach, afterAll } from "vitest";
import { server } from "./server";
import { resetCaptures } from "./handlers";

beforeAll(() => { server.listen({ onUnhandledRequest: "error" }); });

afterEach(() => {
  server.resetHandlers();
  resetCaptures();
});

afterAll(() => { server.close(); });
