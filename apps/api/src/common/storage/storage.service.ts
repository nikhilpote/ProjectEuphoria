/**
 * StorageService — abstracts local disk vs S3/R2 uploads.
 *
 * STORAGE_PROVIDER=local  → saves to uploads/ on disk, serves via /uploads
 * STORAGE_PROVIDER=s3     → uploads to S3 or Cloudflare R2, returns CDN URL
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, promises as fs } from 'fs';
import { lookup as mimeLookup } from 'mime-types';
import * as path from 'path';
import * as os from 'os';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';

export interface MediaFile {
  url: string;
  filename: string;
  size: number;
  uploadedAt: string; // ISO date
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: 'local' | 's3';
  private readonly s3: S3Client | null = null;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly localApiHost: string;

  constructor(private readonly config: ConfigService) {
    this.provider = (config.get<string>('STORAGE_PROVIDER') ?? 'local') as 'local' | 's3';
    this.bucket = config.get<string>('S3_BUCKET') ?? 'euphoria-media';
    this.publicUrl = config.get<string>('S3_PUBLIC_URL') ?? '';
    this.localApiHost = config.get<string>('API_HOST') ?? 'http://localhost:3000';

    if (this.provider === 's3') {
      const endpoint = config.get<string>('S3_ENDPOINT');
      this.s3 = new S3Client({
        region: config.get<string>('S3_REGION') ?? 'auto',
        ...(endpoint ? { endpoint, forcePathStyle: false } : {}),
        credentials: {
          accessKeyId: config.get<string>('S3_ACCESS_KEY_ID') ?? '',
          secretAccessKey: config.get<string>('S3_SECRET_ACCESS_KEY') ?? '',
        },
      });
      this.logger.log(`Storage: S3 (bucket=${this.bucket}, endpoint=${endpoint ?? 'AWS'})`);
    } else {
      this.logger.log('Storage: local disk (uploads/)');
    }
  }

  /**
   * Generate a short-lived signed URL for a stored video.
   *
   * For S3/R2: returns a pre-signed GetObject URL valid for `expiresInSeconds`.
   * For local: returns the plain URL (dev only — no signing needed locally).
   *
   * @param storedUrl   The permanent URL stored in the DB (e.g. https://cdn.../media/file.mp4)
   * @param expiresInSeconds  How long the signed URL stays valid (default: 2 hours)
   */
  async signVideoUrl(storedUrl: string, expiresInSeconds = 7200): Promise<string> {
    if (this.provider !== 's3' || !this.s3) {
      // Local dev — URL is already accessible, no signing needed
      return storedUrl;
    }

    // Extract the S3 key from the stored public URL
    const publicBase = this.publicUrl.replace(/\/$/, '');
    const key = storedUrl.startsWith(publicBase)
      ? storedUrl.slice(publicBase.length + 1)
      : storedUrl;

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Upload a file to the configured storage backend.
   * @param localPath  Absolute path to the temp file on disk (from multer)
   * @param filename   Final filename (uuid + ext), already sanitised by multer
   * @returns          Public URL to access the file
   */
  async upload(localPath: string, filename: string): Promise<string> {
    if (this.provider === 's3') {
      return this.uploadToS3(localPath, filename);
    }
    // Local: file is already on disk in uploads/, just return the URL
    return `${this.localApiHost}/uploads/${filename}`;
  }

  /**
   * Upload a raw buffer directly to S3 with a specific key path.
   * Used for game package deployment where files are extracted from ZIP in-memory.
   * @param buffer    File contents
   * @param key       Full S3 key, e.g. "games/trivia/v1.0.0/web/index.html"
   * @param mimeType  MIME type string
   * @returns         Public URL
   */
  async uploadBuffer(buffer: Buffer, key: string, mimeType: string): Promise<string> {
    if (this.provider === 's3') {
      if (!this.s3) throw new Error('S3 client not initialised');
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        }),
      );
      const publicUrl = this.publicUrl.replace(/\/$/, '');
      return `${publicUrl}/${key}`;
    }
    // Local: write buffer to uploads/ directory
    const filename = key.replace(/\//g, '_');
    const localPath = `uploads/${filename}`;
    await fs.writeFile(localPath, buffer);
    return `${this.localApiHost}/uploads/${filename}`;
  }

  /**
   * List uploaded media files. Filters to video + image types.
   */
  async listMedia(): Promise<MediaFile[]> {
    if (this.provider === 's3') {
      return this.listS3Media();
    }
    return this.listLocalMedia();
  }

  private async listS3Media(): Promise<MediaFile[]> {
    if (!this.s3) return [];
    const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v']);

    let continuationToken: string | undefined;
    const items: MediaFile[] = [];

    do {
      const response = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: 'media/',
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        }),
      );

      for (const obj of response.Contents ?? []) {
        if (!obj.Key) continue;
        const ext = path.extname(obj.Key).toLowerCase();
        if (!VIDEO_EXTS.has(ext)) continue;

        const publicUrl = this.publicUrl.replace(/\/$/, '');
        items.push({
          url: `${publicUrl}/${obj.Key}`,
          filename: path.basename(obj.Key),
          size: obj.Size ?? 0,
          uploadedAt: (obj.LastModified ?? new Date()).toISOString(),
        });
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    // Newest first
    return items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  private async listLocalMedia(): Promise<MediaFile[]> {
    const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v']);
    const dir = 'uploads';

    try {
      const files = await fs.readdir(dir);
      const items: MediaFile[] = [];

      for (const filename of files) {
        const ext = path.extname(filename).toLowerCase();
        if (!VIDEO_EXTS.has(ext)) continue;

        const stat = await fs.stat(path.join(dir, filename)).catch(() => null);
        if (!stat) continue;

        items.push({
          url: `${this.localApiHost}/uploads/${filename}`,
          filename,
          size: stat.size,
          uploadedAt: stat.birthtime.toISOString(),
        });
      }

      return items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    } catch {
      return [];
    }
  }

  /**
   * Resolve a stored URL to a local file path readable by ffmpeg.
   * For local storage: extracts the filename and returns the uploads/ path.
   * For S3: downloads to a temp file and returns that path.
   * Caller is responsible for deleting the temp file if `isTmp` is true.
   */
  async getReadablePath(url: string): Promise<{ filePath: string; isTmp: boolean }> {
    if (this.provider !== 's3') {
      // Local — file lives at uploads/{filename}
      const filename = path.basename(new URL(url).pathname);
      return { filePath: path.join('uploads', filename), isTmp: false };
    }

    // S3 — download to temp file
    const ext = path.extname(new URL(url).pathname) || '.mp4';
    const tmpPath = path.join(os.tmpdir(), `euphoria_${Date.now()}${ext}`);

    const publicBase = this.publicUrl.replace(/\/$/, '');
    const key = url.startsWith(publicBase) ? url.slice(publicBase.length + 1) : url;

    if (!this.s3) throw new Error('S3 client not initialised');
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const response = await this.s3.send(command);
    await pipeline(response.Body as Readable, createWriteStream(tmpPath));

    return { filePath: tmpPath, isTmp: true };
  }

  /**
   * Delete a single object by its stored public URL.
   * For local storage: removes the file from uploads/.
   */
  async deleteFile(storedUrl: string): Promise<void> {
    if (this.provider === 's3') {
      if (!this.s3) return;
      const publicBase = this.publicUrl.replace(/\/$/, '');
      const key = storedUrl.startsWith(publicBase)
        ? storedUrl.slice(publicBase.length + 1)
        : storedUrl;
      await this.s3.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: [{ Key: key }], Quiet: true },
        }),
      );
      this.logger.log(`Deleted S3 object: ${key}`);
    } else {
      const filename = path.basename(new URL(storedUrl).pathname);
      await fs.unlink(path.join('uploads', filename)).catch(() => {});
    }
  }

  /**
   * Delete all S3 objects that belong to a game bundle URL.
   * Extracts the versioned prefix from the bundle_url and deletes everything under it.
   * e.g. "https://cdn.../games/trivia/v1.0.0/web/index.html" → deletes all under "games/trivia/v1.0.0/"
   */
  async deleteGameBundle(bundleUrl: string): Promise<void> {
    const publicBase = this.publicUrl.replace(/\/$/, '');
    const key = bundleUrl.startsWith(publicBase)
      ? bundleUrl.slice(publicBase.length + 1)
      : bundleUrl;

    // key = "games/{id}/v{version}/web/index.html" — take first 3 segments as prefix
    const segments = key.split('/');
    if (segments.length < 3) return;
    const prefix = segments.slice(0, 3).join('/') + '/';
    await this.deleteByPrefix(prefix);
  }

  /**
   * Delete all objects under an S3 prefix (e.g. "games/trivia/v1.0.0/").
   * For local storage: best-effort delete of flattened files matching the prefix.
   * Safe to call even if no objects exist.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    if (this.provider === 's3') {
      await this.deleteS3Prefix(prefix);
    } else {
      await this.deleteLocalPrefix(prefix);
    }
  }

  private async deleteS3Prefix(prefix: string): Promise<void> {
    if (!this.s3) return;

    let continuationToken: string | undefined;
    do {
      const list = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const keys = (list.Contents ?? []).map((obj) => ({ Key: obj.Key! }));
      if (keys.length > 0) {
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys, Quiet: true },
          }),
        );
        this.logger.log(`Deleted ${keys.length} S3 objects under prefix: ${prefix}`);
      }

      continuationToken = list.NextContinuationToken;
    } while (continuationToken);
  }

  private async deleteLocalPrefix(prefix: string): Promise<void> {
    // Local storage flattens keys: "games/trivia/v1.0.0/web/index.html" → "games_trivia_v1.0.0_web_index.html"
    const flatPrefix = prefix.replace(/\//g, '_');
    try {
      const files = await fs.readdir('uploads');
      await Promise.all(
        files
          .filter((f) => f.startsWith(flatPrefix))
          .map((f) => fs.unlink(path.join('uploads', f)).catch(() => {})),
      );
    } catch {
      // uploads/ may not exist in test environments — ignore
    }
  }

  private async uploadToS3(localPath: string, filename: string): Promise<string> {
    if (!this.s3) throw new Error('S3 client not initialised');

    const mimeType = mimeLookup(filename) || 'application/octet-stream';
    const key = `media/${filename}`;

    const fileBuffer = await fs.readFile(localPath);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
        // ACL only works when bucket Object Ownership is NOT "Bucket owner enforced".
        // If your bucket uses a public bucket policy instead, remove this line.
        // ACL: 'public-read',
      }),
    );

    // Delete the temp local file after successful S3 upload
    await fs.unlink(localPath).catch((err: Error) =>
      this.logger.warn(`Failed to delete temp file ${localPath}: ${err.message}`),
    );

    const publicUrl = this.publicUrl.replace(/\/$/, '');
    return `${publicUrl}/${key}`;
  }
}
