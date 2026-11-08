import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToastRegions } from "./Toast";
import {
  EMPTY_TOAST_STATE,
  ERROR_TOAST_MS,
  TOAST_MS,
  hideToast,
  nextToast,
  pushToast,
  resultToast,
  toastDuration,
  type ToastMessage,
  type ToastState,
  type ToastTone,
} from "./toast-state";

/** Applies notifies in order, returning every intermediate state so each step can be checked. */
function play(steps: ReadonlyArray<readonly [string, ToastTone]>): { states: ToastState[]; messages: ToastMessage[] } {
  const messages = steps.reduce<ToastMessage[]>(
    (acc, [text, tone]) => [...acc, nextToast(acc.at(-1) ?? null, text, tone)],
    [],
  );
  const states = messages.reduce<ToastState[]>((acc, message) => [...acc, pushToast(acc.at(-1) ?? EMPTY_TOAST_STATE, message)], []);
  return { states, messages };
}

/** The message a step announced: the one now in the live region for its tone. */
function announced(state: ToastState, tone: ToastTone): ToastMessage | null {
  return tone === "error" ? state.alert : state.status;
}

describe("toast state", () => {
  it("keeps errors up longer than confirmations", () => {
    expect(toastDuration("ok")).toBe(TOAST_MS);
    expect(toastDuration("error")).toBe(ERROR_TOAST_MS);
    expect(ERROR_TOAST_MS).toBeGreaterThan(TOAST_MS);
  });

  it("gives every message a new id so a repeated message is announced again", () => {
    const first = nextToast(null, "Copied", "ok");
    const second = nextToast(first, "Copied", "ok");
    expect(second.text).toBe("Copied");
    expect(second.id).not.toBe(first.id);
    expect(first.id).toBe(1);
  });

  it("shows a confirmation that follows an error at once and announces it politely", () => {
    const { states, messages } = play([
      ["We couldn't save that draft.", "error"],
      ["Draft saved", "ok"],
    ]);
    const after = states[1];
    expect(after.visible).toEqual(messages[1]);
    expect(after.status).toEqual(messages[1]);
  });

  it("announces every message in an ok, error, ok sequence", () => {
    const steps = [
      ["Copied", "ok"],
      ["We couldn't delete that contact.", "error"],
      ["Contact deleted", "ok"],
    ] as const;
    const { states, messages } = play(steps);
    const heard = states.map((state, i) => announced(state, steps[i][1]));
    expect(heard).toEqual(messages);
    expect(new Set(messages.map((m) => m.id)).size).toBe(3);
    expect(states.map((s) => s.visible?.text)).toEqual(steps.map(([text]) => text));
  });

  it("does not touch the other region, so an error and a confirmation in one render are both heard", () => {
    const { states, messages } = play([
      ["We couldn't save that draft.", "error"],
      ["Copied", "ok"],
    ]);
    expect(states[1].alert).toEqual(messages[0]);
    expect(states[1].status).toEqual(messages[1]);
  });

  it("hides everything when the visible message expires, and ignores expiry of a replaced message", () => {
    const { states, messages } = play([
      ["We couldn't save that draft.", "error"],
      ["Draft saved", "ok"],
    ]);
    const last = states[1];
    expect(hideToast(last, messages[0].id)).toBe(last);
    expect(hideToast(last, messages[1].id)).toEqual(EMPTY_TOAST_STATE);
  });

  it("does not mutate the previous state", () => {
    const before = pushToast(EMPTY_TOAST_STATE, nextToast(null, "Copied", "ok"));
    const snapshot = { ...before };
    pushToast(before, nextToast(before.visible, "Problem", "error"));
    expect(before).toEqual(snapshot);
  });

  it("maps action results to a tone", () => {
    expect(resultToast({ ok: true, message: "Saved" })).toEqual({ text: "Saved", tone: "ok" });
    expect(resultToast({ ok: false, error: "Nope" })).toEqual({ text: "Nope", tone: "error" });
  });
});

describe("ToastRegions markup", () => {
  const render = (state: ToastState) => renderToStaticMarkup(createElement(ToastRegions, { state }));

  it("announces errors in an alert region and styles the pill as an error", () => {
    const html = render(pushToast(EMPTY_TOAST_STATE, nextToast(null, "We couldn't delete that contact.", "error")));
    expect(html).toMatch(/role="alert"[^>]*><span>We couldn&#x27;t delete that contact.<\/span>/);
    expect(html).toMatch(/role="status"[^>]*><\/div>/);
    expect(html).toContain('class="toast error"');
  });

  it("announces confirmations politely", () => {
    const html = render(pushToast(EMPTY_TOAST_STATE, nextToast(null, "Copied", "ok")));
    expect(html).toMatch(/role="status"[^>]*><span>Copied<\/span>/);
    expect(html).toMatch(/role="alert"[^>]*><\/div>/);
    expect(html).toContain('class="toast"');
  });

  it("puts a confirmation after an error in the status region and on the pill straight away", () => {
    const { states } = play([
      ["We couldn't save that draft.", "error"],
      ["Draft saved", "ok"],
    ]);
    const html = render(states[1]);
    expect(html).toMatch(/role="status"[^>]*><span>Draft saved<\/span>/);
    expect(html).toMatch(/class="toast"[^>]*>Draft saved</);
  });

  it("hides the pill and keeps both regions mounted when there is no message", () => {
    const html = render(EMPTY_TOAST_STATE);
    expect(html).toContain('role="status"');
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/class="toast"[^>]*hidden=""/);
  });
});
