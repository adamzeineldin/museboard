import type { ApplicationPacket } from "@/lib/packet-types";

/** Expandable view of what Inroad prepared for one application. */
export function PacketView({ packet }: { packet: ApplicationPacket }) {
  const { answers } = packet;
  return (
    <details className="rounded-xl bg-surface-2 p-3 text-sm">
      <summary className="cursor-pointer font-semibold">View packet</summary>
      <div className="mt-3 flex flex-col gap-3">
        <div>
          <span className="label">Fit summary</span>
          <ul className="m-0 mt-1 list-disc pl-5">
            {packet.fitSummary.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <span className="label">Tailored summary</span>
          <p className="mt-1">{packet.tailoredSummary}</p>
        </div>
        <div>
          <span className="label">Answers</span>
          <dl className="m-0 mt-1 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className="muted">Name</dt>
            <dd className="m-0">{answers.fullName || "Not set"}</dd>
            <dt className="muted">Email</dt>
            <dd className="m-0 break-all">{answers.email}</dd>
            <dt className="muted">School</dt>
            <dd className="m-0">{answers.school || "Not set"}</dd>
            <dt className="muted">Graduation</dt>
            <dd className="m-0">{answers.gradYear ?? "Not set"}</dd>
            {answers.location ? (
              <>
                <dt className="muted">Location</dt>
                <dd className="m-0">{answers.location}</dd>
              </>
            ) : null}
          </dl>
        </div>
        {packet.notes.length > 0 ? (
          <div>
            <span className="label">You&apos;ll need to answer</span>
            <ul className="m-0 mt-1 list-disc pl-5">
              {packet.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div>
          <span className="label">Resume</span>
          <p className="mt-1">
            {packet.resume ? (
              <a href={packet.resume.downloadPath} download>
                Download {packet.resume.filename}
              </a>
            ) : (
              "No resume on file."
            )}
          </p>
        </div>
      </div>
    </details>
  );
}
