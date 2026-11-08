import { beforeEach, describe, expect, it } from "vitest";
import { clearDraftFocus, requestDraftFocus, takeDraftFocus } from "./draft-focus";

describe("draft focus hand-off", () => {
  beforeEach(() => clearDraftFocus());

  it("moves focus once to the panel for the contact the user picked", () => {
    requestDraftFocus("c1");
    expect(takeDraftFocus("c2")).toBe(false);
    expect(takeDraftFocus("c1")).toBe(true);
    expect(takeDraftFocus("c1")).toBe(false);
  });

  it("does nothing on a plain page load (no request)", () => {
    expect(takeDraftFocus("c1")).toBe(false);
  });

  it("a newer pick replaces an older one", () => {
    requestDraftFocus("c1");
    requestDraftFocus("c2");
    expect(takeDraftFocus("c1")).toBe(false);
    expect(takeDraftFocus("c2")).toBe(true);
  });
});
