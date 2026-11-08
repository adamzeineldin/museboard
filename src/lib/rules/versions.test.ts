import { describe, expect, it } from "vitest";
import { pendingVersion, pickVersionInForce } from "./versions";

interface TestVersion {
  id: string;
  createdAt: Date;
  approvedAt: Date | null;
}

const v = (id: string, created: string, approved: string | null = null): TestVersion => ({
  id,
  createdAt: new Date(created),
  approvedAt: approved ? new Date(approved) : null,
});

describe("pickVersionInForce", () => {
  it("returns null when there are no versions", () => {
    expect(pickVersionInForce([])).toBeNull();
  });

  it("returns null when nothing has been approved", () => {
    expect(pickVersionInForce([v("v1", "2026-11-01T00:00:00Z")])).toBeNull();
  });

  it("returns the newest approved version regardless of input order", () => {
    const versions = [
      v("v2", "2026-11-02T00:00:00Z", "2026-11-02T01:00:00Z"),
      v("v1", "2026-11-01T00:00:00Z", "2026-11-01T01:00:00Z"),
      v("v3", "2026-11-03T00:00:00Z"),
    ];
    expect(pickVersionInForce(versions)?.id).toBe("v2");
  });

  it("keeps the approved version when a newer edit is not approved", () => {
    const versions = [v("v1", "2026-11-01T00:00:00Z", "2026-11-01T01:00:00Z"), v("v2", "2026-11-02T00:00:00Z")];
    expect(pickVersionInForce(versions)?.id).toBe("v1");
  });

  it("breaks createdAt ties by the later approval", () => {
    const versions = [
      v("a", "2026-11-01T00:00:00Z", "2026-11-01T01:00:00Z"),
      v("b", "2026-11-01T00:00:00Z", "2026-11-01T02:00:00Z"),
    ];
    expect(pickVersionInForce(versions)?.id).toBe("b");
  });

  it("does not reorder the caller's array", () => {
    const versions = [v("v1", "2026-11-01T00:00:00Z", "2026-11-01T01:00:00Z"), v("v2", "2026-11-02T00:00:00Z", "2026-11-02T01:00:00Z")];
    const snapshot = versions.map((version) => version.id);
    pickVersionInForce(versions);
    expect(versions.map((version) => version.id)).toEqual(snapshot);
  });
});

describe("pendingVersion", () => {
  it("returns null when there are no versions", () => {
    expect(pendingVersion([])).toBeNull();
  });

  it("returns the newest unapproved version when nothing is in force", () => {
    const versions = [v("v1", "2026-11-01T00:00:00Z"), v("v2", "2026-11-02T00:00:00Z")];
    expect(pendingVersion(versions)?.id).toBe("v2");
  });

  it("returns an unapproved version created after the one in force", () => {
    const versions = [v("v1", "2026-11-01T00:00:00Z", "2026-11-01T01:00:00Z"), v("v2", "2026-11-02T00:00:00Z")];
    expect(pendingVersion(versions)?.id).toBe("v2");
  });

  it("ignores stale unapproved versions older than the one in force", () => {
    const versions = [v("draft", "2026-11-01T00:00:00Z"), v("v2", "2026-11-02T00:00:00Z", "2026-11-02T01:00:00Z")];
    expect(pendingVersion(versions)).toBeNull();
  });

  it("returns null when the newest version is approved", () => {
    const versions = [v("v1", "2026-11-01T00:00:00Z", "2026-11-01T01:00:00Z")];
    expect(pendingVersion(versions)).toBeNull();
  });
});
