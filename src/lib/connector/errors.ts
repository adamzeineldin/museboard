// Errors the connector token service throws. `message` is safe to show to the user as-is.

export type ConnectorErrorCode = "invalid_input" | "not_found" | "limit";

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;

  constructor(code: ConnectorErrorCode, message: string) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
  }
}

export const isConnectorError = (error: unknown): error is ConnectorError => error instanceof ConnectorError;
