export type ErrorCode =
  | "AUTH_ERROR"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "CONFIG_ERROR"
  | "PROVIDER_ERROR"
  | "DATABASE_ERROR"
  | "OAUTH_ERROR"
  | "SEND_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly status = 500) {
    super(message);
    this.name = "AppError";
  }
}

export function errorResponse(error: unknown, fallback = "Something went wrong.") {
  if (error instanceof AppError) {
    return { error: error.message, code: error.code };
  }
  return { error: error instanceof Error ? error.message : fallback, code: "INTERNAL_ERROR" as const };
}

export function errorStatus(error: unknown) {
  return error instanceof AppError ? error.status : 500;
}
