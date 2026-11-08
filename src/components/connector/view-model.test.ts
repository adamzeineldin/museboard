import { describe, expect, it } from "vitest";
import { connectorFailure, connectorSuccess, scopeLabel, tokenRows } from "./view-model";

const NOW = new Date("2026-11-07T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("tokenRows", () => {
  it("labels scope and usage, listing active tokens before revoked ones", () => {
    const rows = tokenRows(
      [
        { id: "r", name: "Old", scope: "write", createdAt: hoursAgo(50), lastUsedAt: hoursAgo(49), revokedAt: hoursAgo(48) },
        { id: "a", name: "Phone", scope: "read", createdAt: hoursAgo(3), lastUsedAt: null, revokedAt: null },
        { id: "b", name: "Laptop", scope: "write", createdAt: hoursAgo(5), lastUsedAt: hoursAgo(1), revokedAt: null },
      ],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "r"]);
    expect(rows[0]).toMatchObject({ scopeLabel: "Read only", lastUsedLabel: "Never used", revoked: false, revokedLabel: null });
    expect(rows[1]).toMatchObject({ scopeLabel: "Read and write", lastUsedLabel: expect.stringMatching(/^Last used /) });
    expect(rows[2]).toMatchObject({ revoked: true, revokedLabel: expect.stringMatching(/^Revoked /) });
    expect(rows[0].createdLabel).toMatch(/^Created /);
  });

  it("labels an unknown scope safely", () => {
    expect(scopeLabel("admin")).toBe("Unknown access");
  });
});

describe("action states", () => {
  it("only success states carry the created token", () => {
    expect(connectorFailure("No")).toMatchObject({ status: "error", message: "No" });
    expect(connectorFailure("No")).not.toHaveProperty("created");
    expect(connectorSuccess("Done")).not.toHaveProperty("created");
    expect(connectorSuccess("Done", { token: "inr_x", name: "n", scopeLabel: "Read only" }).created?.token).toBe("inr_x");
  });
});
