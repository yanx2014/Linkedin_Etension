// Structured error types shared across the extension and (mirrored in) the backend.
// Every error carries a stable `code` so callers can branch deterministically
// and audit records can reference it.

export class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export class ValidationError extends AppError {
  constructor(message, details = {}) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class UnsupportedLayoutError extends AppError {
  constructor(message, details = {}) {
    super('UNSUPPORTED_LAYOUT', message, details);
    this.name = 'UnsupportedLayoutError';
  }
}

export class BlockedStateError extends AppError {
  constructor(message, details = {}) {
    super('BLOCKED_CHECKPOINT', message, details);
    this.name = 'BlockedStateError';
  }
}

export class EnrichmentError extends AppError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'EnrichmentError';
  }
}

// Normalize any thrown value into a plain, serializable object.
export function toErrorPayload(err) {
  if (err instanceof AppError) return err.toJSON();
  if (err instanceof Error) return { code: 'UNEXPECTED_ERROR', message: err.message, details: {} };
  return { code: 'UNEXPECTED_ERROR', message: String(err), details: {} };
}
