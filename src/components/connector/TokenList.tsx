"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Chip } from "@/components/ui";
import type { ConnectorFormAction } from "./CreateTokenForm";
import { IDLE_CONNECTOR_STATE, type TokenRow } from "./view-model";

export interface TokenListProps {
  tokens: TokenRow[];
  revokeAction: ConnectorFormAction;
}

interface ConfirmProps {
  token: TokenRow | null;
  pending: boolean;
  formAction: (formData: FormData) => void;
  onCancel: () => void;
}

/** Native modal confirm: focus is trapped, Escape cancels. */
function ConfirmRevoke({ token, pending, formAction, onCancel }: ConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (token && !dialog.open) dialog.showModal();
    if (!token && dialog.open) dialog.close();
  }, [token]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="revoke-token-title"
      aria-describedby="revoke-token-body"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-5 text-fg shadow-card backdrop:bg-black/40"
    >
      <form action={formAction} className="flex flex-col gap-3">
        <h2 id="revoke-token-title">Revoke “{token?.name}”?</h2>
        <p id="revoke-token-body" className="muted">
          Muse stops having access through this token right away. Anything already done stays in Activity. You can create a new
          token later.
        </p>
        <input type="hidden" name="tokenId" value={token?.id ?? ""} />
        <div className="actions">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Revoking…" : "Revoke access"}
          </Button>
          <Button onClick={onCancel} disabled={pending} autoFocus>
            Keep it
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export function TokenList({ tokens, revokeAction }: TokenListProps) {
  const [state, formAction, pending] = useActionState(revokeAction, IDLE_CONNECTOR_STATE);
  // A finished revoke removes the row's Revoke button (the dialog's opener), so move focus to the labelled list
  // instead of letting it fall to <body>. Focus goes to the list, not the message, so the live region below
  // announces the result once. This runs after the dialog's own close effect (child effects run first).
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (state.status !== "idle") listRef.current?.focus();
  }, [state.nonce, state.status]);
  // The dialog belongs to the action result it was opened on: a finished revoke (new nonce) closes it.
  const [opened, setOpened] = useState<{ token: TokenRow; nonce: number } | null>(null);
  const confirming = opened && opened.nonce === state.nonce ? opened.token : null;
  const setConfirming = (token: TokenRow | null) => setOpened(token ? { token, nonce: state.nonce } : null);

  return (
    <>
      <ul ref={listRef} className="list" aria-label="Muse connections" tabIndex={-1}>
        {tokens.map((token) => (
          <li key={token.id} className="row">
            <div className="logo" aria-hidden="true">
              M
            </div>
            <div className="min-w-0">
              <div className="t">
                {token.name} <span className="muted font-medium">· {token.scopeLabel}</span>
              </div>
              <div className="meta">
                <span>{token.createdLabel}</span>
                <span>{token.revokedLabel ?? token.lastUsedLabel}</span>
              </div>
            </div>
            <div className="side">
              {token.revoked ? (
                <Chip tone="neutral">Revoked</Chip>
              ) : (
                <Button size="small" onClick={() => setConfirming(token)} aria-label={`Revoke ${token.name}`}>
                  Revoke
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {/* Keyed by nonce so a repeated identical message is a new node and is announced again. */}
      <div aria-live="polite">
        {state.status === "error" ? (
          <p key={state.nonce} className="banner hold">
            {state.message}
          </p>
        ) : state.status === "success" ? (
          <p key={state.nonce} className="banner">
            {state.message}
          </p>
        ) : null}
      </div>
      <ConfirmRevoke token={confirming} pending={pending} formAction={formAction} onCancel={() => setConfirming(null)} />
    </>
  );
}
