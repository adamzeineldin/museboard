import type { ReferralPacket } from "@/lib/packet-types";

export function PacketView({ packet, companyName }: { packet: ReferralPacket; companyName: string }) {
  return (
    <section aria-labelledby="packet-heading" className="flex flex-col gap-2">
      <h3 id="packet-heading" className="label">
        Referral packet
      </h3>
      <div className="packet">
        <div>
          <b>The role</b>
          {packet.role ? (
            <>
              {packet.role.title} at {packet.role.company},{" "}
              <a href={packet.role.url} target="_blank" rel="noopener noreferrer" className="text-accent-ink underline">
                posting link<span className="sr-only"> (opens in a new tab)</span>
              </a>
              .
            </>
          ) : (
            <>No specific role at {companyName}. Pick one above to add the posting link.</>
          )}
        </div>
        <div>
          <b>Fit summary</b>
          <ul className="flex list-none flex-col gap-1 p-0 m-0">
            {packet.fitSummary.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <b>Resume</b>
          {packet.resume ? (
            <a href={packet.resume.downloadPath} className="text-accent-ink underline" download>
              {packet.resume.filename}
              <span className="sr-only"> (download)</span>
            </a>
          ) : (
            <>No default resume yet. Upload one and it will be attached here.</>
          )}
        </div>
      </div>
    </section>
  );
}
