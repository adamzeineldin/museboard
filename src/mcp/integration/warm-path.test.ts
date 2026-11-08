import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "@/app/mcp/route";
import { createContact } from "@/lib/outreach";
import { resetDb } from "@/test/db";
import { newStudent, useTempStorage } from "@/test/integration/world";
import { call } from "../testing/calls";
import { connectClient, startRouteServer, type TestHttpServer } from "../testing/http-harness";
import { studentWithCampaign, tokenFor, type McpWorld } from "../testing/world";

// find_warm_path must not reveal company names that only exist because another user saved a contact there.

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

describe("find_warm_path without contacts", () => {
  it("echoes the typed name instead of another user's company", async () => {
    const other = await newStudent();
    await createContact(other.id, { name: "Sam Rivera", role: "Founder", company: "Acme Stealth Labs", relationship: "Friend" });

    const result = await call(client, "find_warm_path", { company: "acme" });
    expect(result).toMatchObject({ isError: false, data: { company: null, contacts: [] } });
    expect(result.text).toBe("No saved contacts at acme.");
    expect(JSON.stringify(result)).not.toContain("Stealth");
  });

  it("still names the company when the caller has contacts there", async () => {
    const result = await call(client, "find_warm_path", { company: "meta" });
    expect(result.data.company).toBe("Meta");
    expect(result.data.contacts).toHaveLength(2);
  });
});
