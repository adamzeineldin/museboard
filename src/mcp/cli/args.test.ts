import { describe, expect, it } from "vitest";
import { parseCreateTokenArgs } from "./args";

describe("parseCreateTokenArgs", () => {
  it("defaults to a write token named Muse review", () => {
    expect(parseCreateTokenArgs(["demo@inroad.test"])).toEqual({ email: "demo@inroad.test", scope: "write", name: "Muse review" });
  });

  it("reads --scope and --name", () => {
    expect(parseCreateTokenArgs(["--scope", "read", "demo@inroad.test", "--name", "Reviewer"])).toEqual({
      email: "demo@inroad.test",
      scope: "read",
      name: "Reviewer",
    });
  });

  it.each([[[]], [["not-an-email"]], [["a@b.test", "--scope", "admin"]], [["a@b.test", "--name"]], [["a@b.test", "--force"]], [["a@b.test", "b@b.test"]]])(
    "rejects %j with usage",
    (argv) => {
      expect(() => parseCreateTokenArgs(argv)).toThrow(/Usage:/);
    },
  );
});
