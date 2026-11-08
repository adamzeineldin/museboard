// Errors the connector token service throws. `message` is safe to show to the user as-is.

export type ConnectorErrorCode = "invalid_input" | "not_found" | "limit";

/** The create-form input an invalid_input error belongs to, so the form can mark that field. */
export type ConnectorField = "name" | "scope";

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly field?: ConnectorField;

  constructor(code: ConnectorErrorCode, message: string, field?: ConnectorField) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
    if (field) this.field = field;
  }
}

export const isConnectorField = (value: unknown): value is ConnectorField => value === "name" || value === "scope";

export const isConnectorError = (error: unknown): error is ConnectorError => error instanceof ConnectorError;
