import { describe, expect, it } from "vitest";
import { IDLE_RESUME_STATE, resumeFailure } from "./action-state";
import { activeChoice, chooseFile, clientProblem } from "./file-choice";

const file = (name: string, size = 10): Pick<File, "name" | "size"> => ({ name, size });

describe("clientProblem", () => {
  it("accepts a normal resume and flags bad ones", () => {
    expect(clientProblem(file("cv.pdf"))).toBeNull();
    expect(clientProblem(file("cv.exe"))).toBe("Upload a PDF, DOCX or TXT file.");
    expect(clientProblem(file("cv.txt", 0))).toBe("That file is empty.");
    expect(clientProblem(file("cv.txt", 6 * 1024 * 1024))).toMatch(/larger than 5 MB/);
  });
});

describe("file choice", () => {
  it("is active for the action result it was chosen against", () => {
    const choice = chooseFile(file("cv.pdf"), IDLE_RESUME_STATE);
    expect(activeChoice(choice, IDLE_RESUME_STATE)).toEqual({ forState: IDLE_RESUME_STATE, problem: null });
  });

  it("is cleared by a new action result, because React resets the form and the file input", () => {
    const choice = chooseFile(file("cv.pdf"), IDLE_RESUME_STATE);
    expect(activeChoice(choice, resumeFailure("We couldn't read that PDF."))).toBeNull();
  });

  it("is empty when the picker is cancelled", () => {
    expect(chooseFile(undefined, IDLE_RESUME_STATE)).toBeNull();
  });

  it("carries the client-side problem", () => {
    expect(chooseFile(file("cv.exe"), IDLE_RESUME_STATE)?.problem).toBe("Upload a PDF, DOCX or TXT file.");
  });
});
