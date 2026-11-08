import { describe, expect, it } from "vitest";
import { DIGEST_SEND_FAILED_ACTION, DIGEST_SENDING_ACTION, DIGEST_SENT_ACTION, isWeekTaken } from "./send-claim";

const WEEK = "2026-11-02T05:00:00.000Z";
const OTHER = "2026-10-26T04:00:00.000Z";
const row = (action: string, weekStart: string = WEEK) => ({ action, payload: { weekStart } });

describe("isWeekTaken", () => {
  it("is free with no rows, or only rows for another week", () => {
    expect(isWeekTaken([], WEEK)).toBe(false);
    expect(isWeekTaken([row(DIGEST_SENT_ACTION, OTHER), row(DIGEST_SENDING_ACTION, OTHER)], WEEK)).toBe(false);
  });

  it("is taken once sent, or while a send is in progress or was interrupted", () => {
    expect(isWeekTaken([row(DIGEST_SENT_ACTION)], WEEK)).toBe(true);
    expect(isWeekTaken([row(DIGEST_SENDING_ACTION)], WEEK)).toBe(true);
  });

  it("is free again after every claim for the week failed", () => {
    expect(isWeekTaken([row(DIGEST_SEND_FAILED_ACTION), row(DIGEST_SENDING_ACTION)], WEEK)).toBe(false);
    expect(isWeekTaken([row(DIGEST_SENDING_ACTION), row(DIGEST_SEND_FAILED_ACTION), row(DIGEST_SENDING_ACTION)], WEEK)).toBe(true);
  });

  it("ignores rows with a missing or malformed payload", () => {
    expect(isWeekTaken([{ action: DIGEST_SENT_ACTION, payload: null }], WEEK)).toBe(false);
  });
});
