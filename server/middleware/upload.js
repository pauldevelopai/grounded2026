import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import fs from 'fs';

const UPLOAD_ROOT = path.resolve(process.cwd(), '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const entityType = req.body.entity_type || 'general';
    const now = new Date();
    const dir = path.join(UPLOAD_ROOT, entityType, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
];

function fileFilter(req, file, cb) {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not supported. Accepted: PDF, DOCX, XLSX, CSV, TXT`));
  }
}

// Training agendas, slide decks and reports are routinely larger than 10MB; cap at
// 100MB (env-overridable) so real documents aren't silently rejected.
const MAX_MB = parseInt(process.env.UPLOAD_MAX_MB, 10) || 100;
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});
