import { describe, expect, it, vi } from "vitest";
import { armedAfterOutcome, hadFocusAtActivation, restoreFocusIfLost, type FocusDocument } from "./prepare-focus";

const target = () => ({ focus: vi.fn() });
const body = { id: "body" };

function fakeDocument(active: unknown, heading: ReturnType<typeof target> | null): FocusDocument {
  return { activeElement: active, body, getElementById: (id: string) => (id === "job-title" ? heading : null) } as unknown as FocusDocument;
}

describe("hadFocusAtActivation", () => {
  it("arms only when the pressed button itself holds focus", () => {
    const button = { id: "prepare" };
    expect(hadFocusAtActivation({ activeElement: button } as unknown as FocusDocument, button)).toBe(true);
    // Safari doesn't focus a clicked button, so nothing is armed and focus is never moved for that user.
    expect(hadFocusAtActivation({ activeElement: body } as unknown as FocusDocument, button)).toBe(false);
  });
});

describe("restoreFocusIfLost", () => {
  it("moves focus to the target without scrolling when focus has dropped to <body>", () => {
    const heading = target();
    expect(restoreFocusIfLost(fakeDocument(body, heading), "job-title")).toBe(true);
    expect(heading.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("treats a null activeElement as lost focus", () => {
    const heading = target();
    expect(restoreFocusIfLost(fakeDocument(null, heading), "job-title")).toBe(true);
    expect(heading.focus).toHaveBeenCalledOnce();
  });

  it("never steals focus the user moved to another element", () => {
    const heading = target();
    expect(restoreFocusIfLost(fakeDocument({ id: "search" }, heading), "job-title")).toBe(false);
    expect(heading.focus).not.toHaveBeenCalled();
  });

  it("does nothing when the target is gone", () => {
    expect(restoreFocusIfLost(fakeDocument(body, null), "job-title")).toBe(false);
  });
});

describe("armedAfterOutcome", () => {
  it("stays armed for this request when it prepared the job, so the hidden button hands focus on", () => {
    expect(armedAfterOutcome(1, 1, { ok: true, status: "prepared" })).toBe(1);
  });

  it("disarms on a refused result, a held result that keeps the button, or a thrown request", () => {
    expect(armedAfterOutcome(1, 1, { ok: false })).toBeNull();
    expect(armedAfterOutcome(1, 1, { ok: true, status: "waiting" })).toBeNull();
  });

  it("leaves the hand-off alone when it belongs to another request or was never armed", () => {
    expect(armedAfterOutcome(2, 1, { ok: false })).toBe(2);
    expect(armedAfterOutcome(null, 1, { ok: true, status: "prepared" })).toBeNull();
  });
});
