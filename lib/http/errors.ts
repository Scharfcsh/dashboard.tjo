// ---------------------------------------------------------------------------
// One error shape for every endpoint (SOP 16.3): a stable machine code plus a
// human message.   { "error": { "code": "...", "message": "...", "details"? } }
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN_ORIGIN"
  | "RATE_LIMITED"
  | "VALIDATION_FAILED"
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN_ORIGIN: 401,
  RATE_LIMITED: 429,
  VALIDATION_FAILED: 400,
  INVALID_JSON: 400,
  PAYLOAD_TOO_LARGE: 413,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE: 409,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export const notFound = (what: string) => new ApiError("NOT_FOUND", `${what} not found`);
