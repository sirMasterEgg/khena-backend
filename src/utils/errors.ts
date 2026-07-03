export type ErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super("NOT_FOUND", 400, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", 400, message);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super("BAD_REQUEST", 400, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "unauthorized") {
    super("UNAUTHORIZED", 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "forbidden") {
    super("FORBIDDEN", 403, message);
  }
}

/** Bentuk body JSON standar untuk semua error response. */
export function errorBody(
  code: ErrorCode,
  message: string,
  details: unknown = null,
) {
  return { error: { code, message, details } };
}
