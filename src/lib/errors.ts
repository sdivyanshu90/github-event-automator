export type ErrorCode =
  | "VALIDATION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "CONFIGURATION"
  | "GITHUB_API"
  | "SLACK"
  | "AI_PROVIDER"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly retryable = false,
    public readonly status = 500,
    public readonly safeMessage = message,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION", false, 400);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(message, "AUTHENTICATION", false, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(message, "AUTHORIZATION", false, 403);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, "CONFIGURATION", false, 500, "A required integration is not configured");
  }
}

export class ProviderError extends AppError {
  constructor(
    message: string,
    code: "GITHUB_API" | "SLACK" | "AI_PROVIDER",
    retryable: boolean,
    status: number,
    safeMessage: string,
  ) {
    super(message, code, retryable, status, safeMessage);
  }
}

export function errorDetails(error: unknown): {
  code: ErrorCode;
  retryable: boolean;
  safeMessage: string;
} {
  if (error instanceof AppError) {
    return { code: error.code, retryable: error.retryable, safeMessage: error.safeMessage };
  }
  if (error instanceof TypeError) {
    return { code: "INTERNAL", retryable: true, safeMessage: "A network or runtime error occurred" };
  }
  return { code: "INTERNAL", retryable: false, safeMessage: "An unexpected error occurred" };
}
