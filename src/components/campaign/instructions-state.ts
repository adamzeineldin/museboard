export interface InstructionsState {
  status: "idle" | "success" | "error";
  message: string;
  /** The text to show after the action ran: the saved value, or what the user typed when saving failed. */
  value: string | null;
}

export const IDLE_INSTRUCTIONS_STATE: InstructionsState = { status: "idle", message: "", value: null };
