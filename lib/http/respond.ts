import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { ApiError, type ErrorCode } from "@/lib/http/errors";

export function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

export function errorResponse(code: ErrorCode, message: string, details?: unknown, headers?: HeadersInit): Response {
  const err = new ApiError(code, message, details);
  return Response.json(
    { error: { code: err.code, message: err.message, ...(details === undefined ? {} : { details }) } },
    { status: err.status, headers }
  );
}

export function zodDetails(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

/** Map anything thrown inside a handler onto the error contract. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) return errorResponse(err.code, err.message, err.details);
  if (err instanceof ZodError) return errorResponse("VALIDATION_FAILED", "Request validation failed", zodDetails(err));
  console.error("[api] unhandled error", err);
  return errorResponse("INTERNAL_ERROR", "Internal server error");
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response> | Response;

/** Wrap a route handler so thrown ApiError/ZodError become contract responses. */
export function handler<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Parse a JSON body, turning malformed JSON into a 400 rather than a 500. */
export async function readJson(req: Request, maxBytes = 1_000_000): Promise<unknown> {
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new ApiError("PAYLOAD_TOO_LARGE", `Body exceeds ${maxBytes} bytes`);
  }
  if (text.trim() === "") throw new ApiError("INVALID_JSON", "Request body is empty");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("INVALID_JSON", "Request body is not valid JSON");
  }
}

/** Like readJson, but an empty body is `{}` (for endpoints whose body is optional). */
export async function readOptionalJson(req: Request, maxBytes = 1_000_000): Promise<unknown> {
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new ApiError("PAYLOAD_TOO_LARGE", `Body exceeds ${maxBytes} bytes`);
  }
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("INVALID_JSON", "Request body is not valid JSON");
  }
}
