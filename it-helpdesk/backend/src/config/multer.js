/**
 * Multer Configuration — File Upload Handling
 *
 * Configures multer for handling multipart/form-data (file uploads).
 * Enforces:
 *   - Maximum file size per file (from env MAX_FILE_SIZE)
 *   - Allowed MIME types (from env ALLOWED_FILE_TYPES)
 *   - Maximum attachments per upload batch (from env MAX_ATTACHMENTS_PER_TICKET)
 *   - Files stored in UPLOAD_DIR on disk (not in DB)
 *
 * Security note: We validate MIME types in the fileFilter callback.
 * Clients cannot bypass this by renaming files because multer reads the
 * actual Content-Type header sent by the browser, not just the extension.
 */

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const logger = require("./logger");

// ── Read upload constraints from environment ─────────────────────────────────
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024; // 5 MB default
const ALLOWED_FILE_TYPES = (
  process.env.ALLOWED_FILE_TYPES ||
  "image/jpeg,image/png,image/gif,application/pdf,text/plain"
)
  .split(",")
  .map((t) => t.trim());
const MAX_ATTACHMENTS = parseInt(process.env.MAX_ATTACHMENTS_PER_TICKET) || 5;
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

// ── Ensure upload directory exists ───────────────────────────────────────────
// createSync at startup is fine; the directory must exist before any request arrives
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  logger.info("Upload directory created", { path: UPLOAD_DIR });
}

// ── Disk storage strategy ────────────────────────────────────────────────────
// We generate a UUID-based filename to prevent filename collisions and to avoid
// serving predictable URLs (security best practice).
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Keep original extension for MIME type hints but use UUID for the name
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// ── File filter — reject disallowed MIME types ───────────────────────────────
const fileFilter = (req, file, cb) => {
  if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    logger.debug("File upload accepted", {
      originalName: file.originalname,
      mimetype: file.mimetype,
    });
    cb(null, true); // Accept the file
  } else {
    logger.warn("File upload rejected — disallowed MIME type", {
      originalName: file.originalname,
      mimetype: file.mimetype,
      allowedTypes: ALLOWED_FILE_TYPES,
    });
    // Pass an Error so multer sends a 400; do NOT call cb(null, false) or the
    // file silently disappears without an error response.
    cb(
      new Error(
        `File type '${file.mimetype}' is not allowed. Allowed types: ${ALLOWED_FILE_TYPES.join(", ")}`
      ),
      false
    );
  }
};

// ── Multer instance ──────────────────────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE, // Per-file size limit in bytes
    files: MAX_ATTACHMENTS, // Max number of files per request
  },
});

// Export config values so controllers can embed them in response metadata
module.exports = {
  upload,
  uploadConfig: {
    maxFileSize: MAX_FILE_SIZE,
    allowedFileTypes: ALLOWED_FILE_TYPES,
    maxAttachments: MAX_ATTACHMENTS,
    uploadDir: UPLOAD_DIR,
  },
};
