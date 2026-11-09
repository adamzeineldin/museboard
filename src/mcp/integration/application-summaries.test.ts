import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "@/app/mcp/route";
import { skipWaiting } from "@/lib/applications";
import { resetDb } from "@/test/db";
import { JOB_IDS, useTempStorage } from "@/test/integration/world";
import { call } from "../testing/calls";
import { connectClient, startRouteServer, type TestHttpServer } from "../testing/http-harness";
import { studentWithCampaign, tokenFor, type McpWorld } from "../testing/world";

// The text summaries Muse relays for decided applications must match their real status.

let server: TestHttpServer;
let restoreStorage: () => void;
let world: McpWorld;
let client: Client;

beforeAll(async () => {
  restoreStorage = useTempStorage();
  server = await startRouteServer("/mcp", { GET, POST, DELETE });
});
afterAll(async () => {
  await server.close();
  restoreStorage();
});
beforeEach(async () => {
  await resetDb();
  world = await studentWithCampaign();
  client = await connectClient(server.url, await tokenFor(world.user.id));
});
afterEach(async () => {
  await client.close();
});

describe("prepare_application summary", () => {
  it("says the user skipped an application, not that it is waiting on them", async () => {
    const first = await call(client, "prepare_application", { jobId: JOB_IDS.meta });
    expect(first.data.status).toBe("waiting");
    await skipWaiting(world.user.id, first.data.applicationId as string);

    const again = await call(client, "prepare_application", { jobId: JOB_IDS.meta });
    expect(again).toMatchObject({ isError: false, data: { status: "skipped", ok: false, nextStep: null } });
    expect(again.text).toBe("The user skipped this application; nothing will be prepared.");
  });

  it("points a cleared application at submit_application for the packet", async () => {
    const result = await call(client, "prepare_application", { jobId: JOB_IDS.stripe });
    expect(result.data.ok).toBe(true);
    expect(result.text).toMatch(/call submit_application/);
  });

  it("keeps the waiting wording for a waiting application", async () => {
    const result = await call(client, "prepare_application", { jobId: JOB_IDS.meta });
    expect(result.text).toMatch(/^Application is waiting on the user: /);
  });
});
