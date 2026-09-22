export class AIProviderError extends Error {
  readonly provider: string;
  readonly statusCode?: number;
  readonly isRetryable: boolean;
  readonly originalError?: unknown;

  constructor(
    message: string,
    options: {
      provider: string;
      statusCode?: number;
      isRetryable?: boolean;
      originalError?: unknown;
    }
  ) {
    super(`[${options.provider}] ${message}`);
    this.name = 'AIProviderError';
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.isRetryable = options.isRetryable ?? false;
    this.originalError = options.originalError;
  }
}

export class ImageProviderError extends Error {
  readonly provider: string;
  readonly statusCode?: number;
  readonly isRetryable: boolean;
  readonly originalError?: unknown;

  constructor(
    message: string,
    options: {
      provider: string;
      statusCode?: number;
      isRetryable?: boolean;
      originalError?: unknown;
    }
  ) {
    super(`[${options.provider}] ${message}`);
    this.name = 'ImageProviderError';
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.isRetryable = options.isRetryable ?? false;
    this.originalError = options.originalError;
  }
}
