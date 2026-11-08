import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getResumeStorage, LocalDiskStorage, newResumeStorageKey, STORAGE_DIR_ENV } from "./storage";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "inroad-storage-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("LocalDiskStorage", () => {
  it("round-trips bytes and deletes them", async () => {
    const storage = new LocalDiskStorage(root);
    const key = "resumes/user1/abc.pdf";
    await storage.put(key, new Uint8Array([1, 2, 3]));
    expect([...(await storage.get(key))]).toEqual([1, 2, 3]);
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrow();
    await expect(storage.delete(key)).resolves.toBeUndefined();
  });

  it("refuses keys that escape the root", async () => {
    const storage = new LocalDiskStorage(root);
    await expect(storage.put("../evil.txt", new Uint8Array([1]))).rejects.toThrow(/Invalid storage key/);
    await expect(storage.get("/etc/passwd")).rejects.toThrow(/Invalid storage key/);
    await expect(storage.delete("resumes/../../x")).rejects.toThrow(/Invalid storage key/);
  });
});

describe("newResumeStorageKey", () => {
  it("builds resumes/<userId>/<random>.<ext> with fresh randomness", () => {
    const a = newResumeStorageKey("user_1", "pdf");
    const b = newResumeStorageKey("user_1", "pdf");
    expect(a).toMatch(/^resumes\/user_1\/[a-f0-9]{32}\.pdf$/);
    expect(a).not.toBe(b);
  });

  it("rejects user ids that could change the path", () => {
    expect(() => newResumeStorageKey("../x", "pdf")).toThrow(/user id/);
  });
});

describe("getResumeStorage", () => {
  it("uses INROAD_STORAGE_DIR when set", async () => {
    const storage = getResumeStorage({ [STORAGE_DIR_ENV]: root });
    await storage.put("resumes/u/k.txt", new Uint8Array([7]));
    expect([...(await new LocalDiskStorage(root).get("resumes/u/k.txt"))]).toEqual([7]);
  });
});
