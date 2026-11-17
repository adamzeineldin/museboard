import { describe, expect, it } from "vitest";
import { boardColumns, columnFor, defaultFilter, stageFor } from "./board";
import type { ActivityRowModel } from "./rows";

const row = (over: Partial<ActivityRowModel>): ActivityRowModel => ({
  id: "a",
  status: "waiting",
  approvedByYou: false,
  companyName: "Stripe",
  title: "SWE Intern",
  reason: "",
  jobUrl: "",
  resumeFilename: null,
  packet: null,
  held: null,
  recordable: false,
  history: [],
  ...over,
});

describe("columnFor", () => {
  it("splits prepared rows into ready and held", () => {
    expect(columnFor(row({ status: "prepared" }))).toBe("ready");
    expect(columnFor(row({ status: "prepared", held: "Weekly limit reached" }))).toBe("held");
  });

  it("maps the other statuses to their own column", () => {
    expect(columnFor(row({ status: "waiting" }))).toBe("waiting");
    expect(columnFor(row({ status: "submitted" }))).toBe("submitted");
    expect(columnFor(row({ status: "skipped" }))).toBe("skipped");
  });
});

describe("boardColumns", () => {
  it("returns five columns in board order and keeps every row exactly once", () => {
    const rows = [
      row({ id: "1", status: "submitted" }),
      row({ id: "2", status: "prepared" }),
      row({ id: "3", status: "prepared", held: "x" }),
      row({ id: "4" }),
    ];
    const columns = boardColumns(rows);
    expect(columns.map((c) => c.key)).toEqual(["waiting", "ready", "held", "submitted", "skipped"]);
    expect(columns.flatMap((c) => c.rows.map((r) => r.id)).sort()).toEqual(["1", "2", "3", "4"]);
    expect(rows).toHaveLength(4);
  });
});

describe("defaultFilter", () => {
  it("picks the first non-empty column, or waiting when the board is empty", () => {
    expect(defaultFilter(boardColumns([row({ status: "submitted" })]))).toBe("submitted");
    expect(defaultFilter(boardColumns([]))).toBe("waiting");
  });
});

describe("stageFor", () => {
  it("labels each column with a tone", () => {
    expect(stageFor(row({ status: "prepared" }))).toEqual({ tone: "progress", label: "Ready to submit" });
    expect(stageFor(row({ status: "submitted", approvedByYou: true }))).toEqual({ tone: "ok", label: "Applied · approved by you" });
    expect(stageFor(row({ status: "skipped" })).tone).toBe("neutral");
  });
});
