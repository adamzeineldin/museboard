// Shared shape for resume server action results (settings page and the /jobs prompt). Pure.

export interface ResumeActionState {
  status: "idle" | "success" | "error";
  message: string;
  /** Changes on every completed action so the form can react (reset, announce) even to repeats. */
  nonce: number;
}

export const IDLE_RESUME_STATE: ResumeActionState = { status: "idle", message: "", nonce: 0 };

export const resumeSuccess = (message: string): ResumeActionState => ({ status: "success", message, nonce: Date.now() });
export const resumeFailure = (message: string): ResumeActionState => ({ status: "error", message, nonce: Date.now() });
