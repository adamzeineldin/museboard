"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import { SCOPE_LABELS, TOKEN_NAME_MAX } from "@/lib/connector/constants";
import { CopyField } from "./CopyField";
import { fieldErrorProps, IDLE_CONNECTOR_STATE, type ConnectorActionState } from "./view-model";

export type ConnectorFormAction = (prev: ConnectorActionState, formData: FormData) => Promise<ConnectorActionState>;

export interface CreateTokenFormProps {
  action: ConnectorFormAction;
}

const SCOPE_HELP = {
  read: "Muse can look at your matches, contacts and campaign. It can't draft, prepare, approve or submit anything.",
  write:
    "Muse can also draft outreach, propose and approve campaign rules, and prepare and submit applications, each with Muse's own approval prompts.",
} as const;

const ERROR_ID = "connector-error";

/** Create a connector token. The plaintext token is shown once, right after creation. */
export function CreateTokenForm({ action }: CreateTokenFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_CONNECTOR_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.nonce, state.status]);

  return (
    <div className="flex flex-col gap-3">
      <form ref={formRef} action={formAction} className="flex flex-col gap-3" noValidate>
        <div className="field">
          <label className="label" htmlFor="connector-name">
            Connection name
          </label>
          <input
            id="connector-name"
            name="name"
            required
            maxLength={TOKEN_NAME_MAX}
            placeholder="Muse on my phone"
            autoComplete="off"
            {...fieldErrorProps(state, "name", ERROR_ID)}
          />
        </div>
        <fieldset className="field m-0 border-0 p-0">
          <legend className="label mb-2">What Muse can do</legend>
          {(["read", "write"] as const).map((scope) => (
            <label key={scope} className="flex items-start gap-2 py-1">
              <input type="radio" name="scope" value={scope} defaultChecked={scope === "read"} aria-describedby={`scope-${scope}-help`} />
              <span>
                <b>{SCOPE_LABELS[scope]}</b>
                <span id={`scope-${scope}-help`} className="hint block">
                  {SCOPE_HELP[scope]}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <div aria-live="polite">
          {state.status === "error" ? (
            <p id={ERROR_ID} className="banner hold" role="alert">
              {state.message}
            </p>
          ) : null}
        </div>
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Creating…" : "Create access token"}
          </Button>
        </div>
      </form>
      {state.status === "success" && state.created ? (
        <div className="banner flex flex-col gap-2" role="status">
          <p>{state.message}</p>
          <CopyField
            label="Access token"
            value={state.created.token}
            hint={`${state.created.name} · ${state.created.scopeLabel}. Paste it into Muse's connector settings. It won't be shown again.`}
          />
        </div>
      ) : null}
    </div>
  );
}
