import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/lib/applications";
import { CampaignError } from "@/lib/campaign";
import { OutreachError } from "@/lib/outreach";
import { GENERIC_TOOL_ERROR, ToolRefusal, toolErrorMessage } from "./errors";
import { INROAD_TOOLS, toolsForScope } from "./server";
import { annotationsFor } from "./tool-kit";

describe("annotationsFor", () => {
  it("makes Read tools read-only and idempotent, and never open-world", () => {
    expect(annotationsFor("read", "Find roles", { destructiveHint: true })).toEqual({
      title: "Find roles",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(annotationsFor("sensitive_write", "Approve", { destructiveHint: true })).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false });
  });
});

describe("tool classes", () => {
  it("classifies every tool as docs/MUSE_CONNECTOR_NOTES.md says", () => {
    const classes = Object.fromEntries(INROAD_TOOLS.map((tool) => [tool.name, tool.museClass]));
    expect(classes).toEqual({
      find_roles: "read",
      find_warm_path: "read",
      get_campaign: "read",
      draft_outreach: "write",
      propose_campaign: "write",
      prepare_application: "write",
      record_submission: "write",
      run_weekly_pass: "write",
      approve_campaign: "sensitive_write",
      submit_application: "sensitive_write",
    });
    expect(toolsForScope("read").map((t) => t.name)).toEqual(["find_roles", "find_warm_path", "get_campaign"]);
    expect(toolsForScope("write")).toHaveLength(10);
  });
});

describe("toolErrorMessage", () => {
  const ctx = { tool: "find_roles", userId: "u1" };

  it("passes through user-safe service messages", () => {
    expect(toolErrorMessage(new ToolRefusal("Nope."), ctx)).toBe("Nope.");
    expect(toolErrorMessage(new CampaignError("not_found", "No such version."), ctx)).toBe("No such version.");
    expect(toolErrorMessage(new ApplicationError("invalid_state", "Not ready."), ctx)).toBe("Not ready.");
    expect(toolErrorMessage(new OutreachError("not_found", "Contact not found."), ctx)).toBe("Contact not found.");
  });

  it("logs anything else and returns a generic message", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(toolErrorMessage(new Error("SELECT * FROM users"), ctx)).toBe(GENERIC_TOOL_ERROR);
    expect(log).toHaveBeenCalledWith("[mcp] tool failed", expect.objectContaining({ tool: "find_roles", userId: "u1" }));
    log.mockRestore();
  });
});
