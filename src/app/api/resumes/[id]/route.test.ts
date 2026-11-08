import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestUser, resetDb } from "@/test/db";

const { getSessionUserId } = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
vi.mock("@/lib/current-user", () => ({ getSessionUserId }));

import { uploadResume } from "@/lib/resume";
import { contentDisposition } from "./content-disposition";
import { GET } from "./route";

const FIXTURES = path.resolve(import.meta.dirname, "../../../../lib/resume/__fixtures__");
const call = (id: string) => GET(new Request(`http://localhost/api/resumes/${id}`), { params: Promise.resolve({ id }) });

let root: string;
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "inroad-route-"));
  process.env.INROAD_STORAGE_DIR = root;
});
afterAll(() => {
  delete process.env.INROAD_STORAGE_DIR;
  rmSync(root, { recursive: true, force: true });
});

describe("GET /api/resumes/[id]", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });

  it("streams the file to its owner as an attachment", async () => {
    const owner = await createTestUser();
    const bytes = new Uint8Array(readFileSync(path.join(FIXTURES, "resume.pdf")));
    const { resume } = await uploadResume(owner.id, { filename: "Résumé v3.pdf", bytes });
    getSessionUserId.mockResolvedValue(owner.id);

    const response = await call(resume.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="R_sum_ v3.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20v3.pdf`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("returns 404 for other users, signed-out requests and unknown ids", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const { resume } = await uploadResume(owner.id, { filename: "cv.txt", bytes: new TextEncoder().encode("Python and Go") });

    getSessionUserId.mockResolvedValue(other.id);
    expect((await call(resume.id)).status).toBe(404);
    getSessionUserId.mockResolvedValue(null);
    expect((await call(resume.id)).status).toBe(404);
    getSessionUserId.mockResolvedValue(owner.id);
    expect((await call("nope")).status).toBe(404);
    expect((await call(" ")).status).toBe(404);
  });

  it("returns 500 without details when something unexpected breaks", async () => {
    getSessionUserId.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await call("abc");
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Something went wrong");
    errorSpy.mockRestore();
  });
});

describe("contentDisposition", () => {
  it("escapes quotes and keeps a fallback", () => {
    expect(contentDisposition('a"b.pdf')).toBe(`attachment; filename="a_b.pdf"; filename*=UTF-8''a%22b.pdf`);
  });
});
