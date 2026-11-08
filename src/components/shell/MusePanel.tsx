import { Chip } from "@/components/ui";
import { formatRelative } from "./format";
import { MUSE_CONNECTION_CHIP, type MuseConnection } from "./muse-connection";
import type { MuseEventModel } from "./muse-event-model";

const MUSE_TOOLS = ["find_roles", "find_warm_path", "draft_outreach", "prepare_application", "submit_application"];

export interface MusePanelProps {
  events: MuseEventModel[];
  connection: MuseConnection;
  now?: Date;
}

/** Right-docked panel listing what Muse did through Inroad (one row per `muse.<tool>` AuditEvent). */
export function MusePanel({ events, connection, now = new Date() }: MusePanelProps) {
  const chip = MUSE_CONNECTION_CHIP[connection];
  return (
    <aside className="muse" aria-label="Muse activity">
      <div className="muse-h">
        <div className="who">
          <span className="avatar" aria-hidden="true">
            M
          </span>
          <div>
            <b>Muse activity</b>
            <span>{chip.subtitle}</span>
          </div>
          <Chip tone={chip.tone}>{chip.label}</Chip>
        </div>
        <div className="tools">
          {MUSE_TOOLS.map((tool) => (
            <code key={tool}>{tool}</code>
          ))}
        </div>
      </div>
      {events.length === 0 ? (
        <div className="empty">
          <b>Nothing from Muse yet</b>
          <p>When Muse uses Inroad on your behalf, every tool call shows up here.</p>
        </div>
      ) : (
        <ol className="chat" aria-live="polite">
          {events.map((event) => (
            <li key={event.id} className="msg tool">
              <b>{event.tool}</b>
              {event.failed ? (
                <>
                  {" "}
                  <Chip tone="hold">Failed</Chip>
                </>
              ) : null}
              {event.summary ? ` → ${event.summary}` : null}
              <time dateTime={event.createdAt.toISOString()}>{formatRelative(event.createdAt, now)}</time>
            </li>
          ))}
        </ol>
      )}
      <div className="muse-f muted">Inroad logs everything Muse does. Outreach is never sent for you.</div>
    </aside>
  );
}
