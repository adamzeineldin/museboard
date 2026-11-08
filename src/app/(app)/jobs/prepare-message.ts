// User-facing toast copy for the Jobs page "Prepare" button. Pure.

export interface PrepareOutcomeInput {
  status: string;
  reason: string;
  title: string;
  companyName: string;
}

export type PrepareActionResult = { ok: true; status: string; message: string } | { ok: false; message: string };

export function prepareMessage({ status, reason, title, companyName }: PrepareOutcomeInput): string {
  const role = `${title} at ${companyName}`;
  switch (status) {
    case "prepared":
      return `Prepared ${role}. It's ready to submit from Activity.`;
    case "waiting":
      return `Held for you: ${reason}. ${role} is waiting on you in Activity.`;
    case "submitted":
      return `You already applied to ${role}.`;
    case "skipped":
      return `You skipped ${role} earlier. It's in Activity if you change your mind.`;
    default:
      return `Updated ${role}. See Activity for details.`;
  }
}
