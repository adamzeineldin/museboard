// Pure: result of the Settings "Weekly digest" toggle action.

export interface DigestToggleState {
  status: "idle" | "success" | "error";
  message: string;
  /** The saved setting after a successful action, else null. */
  enabled: boolean | null;
  nonce: number;
}

export const IDLE_DIGEST_STATE: DigestToggleState = { status: "idle", message: "", enabled: null, nonce: 0 };
