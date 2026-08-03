/** Max files per single pick / drop batch */
export const FM2_MAX_BATCH = 100;

/** Parallel uploads at once */
export const FM2_UPLOAD_CONCURRENCY = 6;

/**
 * Network auto-retries inside a single file upload.
 * User-facing Retry is manual and re-queues only that file.
 */
export const FM2_MAX_RETRIES = 2;

export const FM2_RETRY_DELAY_MS = 800;

/** Throttle UI progress updates (ms) */
export const FM2_PROGRESS_THROTTLE_MS = 80;

export const FM2_IMAGE_ACCEPT =
  "image/*,.heic,.HEIC,.jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp";

export const FM2_FILES_ACCEPT = [
  "image/*",
  "video/*",
  ".stl",
  ".obj",
  ".ply",
  ".dcm",
  ".dicom",
  ".zip",
  ".rar",
  ".pdf",
  ".txt",
  ".csv",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".mp4",
  ".mov",
  "application/pdf",
  "application/zip",
  "application/x-rar-compressed",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "*/*",
].join(",");
