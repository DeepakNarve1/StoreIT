import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

export const isStorageConfigured = (): boolean => {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
};

const getR2Client = () =>
  new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "uploads");

function getLocalFileBaseUrl(): string {
  const apiPublicUrl = process.env.API_PUBLIC_URL?.replace(/\/$/, "");
  if (apiPublicUrl) return apiPublicUrl;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "API_PUBLIC_URL is required when storage is not configured in production",
    );
  }

  return `http://localhost:${process.env.PORT || 5000}`;
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────────
export const uploadFile = async (
  key: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> => {
  if (isStorageConfigured()) {
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    console.log(`☁️  Uploaded to R2: ${key}`);
  } else {
    const fullPath = path.join(LOCAL_UPLOAD_DIR, key);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);
    console.log(`💾 Saved locally: ${key}`);
  }
};

// ─── GET VIEW URL ─────────────────────────────────────────────────────────────
export const getFileViewUrl = async (
  key: string,
  expiresInSeconds = 3600,
): Promise<string> => {
  if (isStorageConfigured()) {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    });
    return getSignedUrl(getR2Client(), command, {
      expiresIn: expiresInSeconds,
    });
  } else {
    return `${getLocalFileBaseUrl()}/uploads/${key}`;
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const deleteFile = async (key: string): Promise<void> => {
  if (isStorageConfigured()) {
    await getR2Client().send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
      }),
    );
    console.log(`☁️  Deleted from R2: ${key}`);
  } else {
    const fullPath = path.join(LOCAL_UPLOAD_DIR, key);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`💾 Deleted locally: ${key}`);
    }
  }
};

// Keep this export for backwards compatibility
export const getSignedViewUrl = getFileViewUrl;

/** Load file bytes from R2 or local uploads (for search indexing, reprocessing). */
export async function downloadFileBuffer(key: string): Promise<Buffer> {
  if (isStorageConfigured()) {
    const out = await getR2Client().send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
      }),
    );
    const body = out.Body;
    if (!body) {
      throw new Error(`Empty object body for key: ${key}`);
    }
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }
  const fullPath = path.join(LOCAL_UPLOAD_DIR, key);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Local file not found: ${key}`);
  }
  return fs.readFileSync(fullPath);
}
