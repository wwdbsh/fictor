const ALLOWED_ERROR_MESSAGES: Record<string, string> = {
  PROVIDER_FAILED: "provider generation failed",
  PROVIDER_UNAVAILABLE: "provider temporarily unavailable",
  DOWNLOAD_FAILED: "provider download failed",
  INVALID_PNG: "downloaded file is not a PNG",
  EMPTY_FILE: "downloaded file is empty",
  FILE_TOO_LARGE: "downloaded file exceeds the configured size limit",
  ASPECT_MISMATCH: "downloaded image has the wrong aspect ratio",
  EXISTING_FILE_CONFLICT: "an existing file has different content",
  LOCAL_VERIFY_FAILED: "local file verification failed",
  BACKUP_VERIFY_FAILED: "backup verification failed",
  LOCAL_HASH_CHANGED: "local file changed before backup",
  UNSAFE_PATH: "asset path is unsafe",
  SYMLINK_TRAVERSAL: "asset path crosses a symbolic link",
  UNKNOWN: "asset operation failed",
};

export interface SafeError {
  code: string;
  message: string;
}

export function redactError(error: unknown): SafeError {
  const raw = error instanceof Error ? error.message : "UNKNOWN";
  const code = Object.hasOwn(ALLOWED_ERROR_MESSAGES, raw) ? raw : "UNKNOWN";
  return { code, message: ALLOWED_ERROR_MESSAGES[code] };
}
