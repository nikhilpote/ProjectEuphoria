import { Injectable, Logger, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { promises as fs } from 'fs';
import { lookup } from 'mime-types';
import AdmZip from 'adm-zip';
import Redis from 'ioredis';
import { GamePackagesRepository, GamePackageRow } from './game-packages.repository';
import { StorageService } from '../../common/storage/storage.service';
import { REDIS_CLIENT } from '../../database/redis.module';
import type { GamePackage, GameManifest } from '@euphoria/types';

/** TTL in seconds for the enabled game packages cache entry */
const GAME_PACKAGES_CACHE_TTL_S = 300;
const GAME_PACKAGES_CACHE_KEY = 'game_packages:enabled';

@Injectable()
export class GamePackagesService {
  private readonly logger = new Logger(GamePackagesService.name);

  constructor(
    private readonly repository: GamePackagesRepository,
    private readonly storageService: StorageService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async uploadPackage(zipLocalPath: string): Promise<GamePackage> {
    const zip = new AdmZip(zipLocalPath);

    // Extract and validate manifest.json
    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) {
      await fs.unlink(zipLocalPath).catch(() => undefined);
      throw new BadRequestException('ZIP must contain a manifest.json at the root');
    }

    let manifest: GameManifest;
    try {
      manifest = JSON.parse(manifestEntry.getData().toString('utf-8')) as GameManifest;
    } catch {
      await fs.unlink(zipLocalPath).catch(() => undefined);
      throw new BadRequestException('manifest.json is not valid JSON');
    }

    if (!manifest.id || !manifest.name || !manifest.version || !manifest.configSchema) {
      await fs.unlink(zipLocalPath).catch(() => undefined);
      throw new BadRequestException(
        'manifest.json must contain id, name, version, and configSchema fields',
      );
    }

    // Upload all files to S3
    const uploadedUrls = new Map<string, string>();
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory);

    await Promise.all(
      entries.map(async (entry) => {
        const mimeType = lookup(entry.entryName) || 'application/octet-stream';
        const key = `games/${manifest.id}/v${manifest.version}/${entry.entryName}`;
        const url = await this.storageService.uploadBuffer(entry.getData(), key, mimeType);
        uploadedUrls.set(entry.entryName, url);
        this.logger.debug(`Uploaded ${entry.entryName} -> ${url}`);
      }),
    );

    // Resolve bundle URL
    const bundleUrl = uploadedUrls.get('web/index.html');
    if (!bundleUrl) {
      await fs.unlink(zipLocalPath).catch(() => undefined);
      throw new BadRequestException('ZIP must contain web/index.html as the bundle entry point');
    }

    // Resolve optional thumbnail
    const thumbnailUrl =
      uploadedUrls.get('thumbnail.png') ?? uploadedUrls.get('thumbnail.jpg') ?? null;

    // Delete the temp ZIP from disk
    await fs.unlink(zipLocalPath).catch((err: Error) =>
      this.logger.warn(`Failed to delete temp ZIP ${zipLocalPath}: ${err.message}`),
    );

    // Upsert: if package with this id already exists, delete it first
    const existing = await this.repository.findById(manifest.id);
    if (existing) {
      await this.repository.delete(manifest.id);
    }

    const row = await this.repository.create({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description ?? null,
      manifest,
      bundleUrl,
      thumbnailUrl,
    });

    this.logger.log(`Game package uploaded: id=${manifest.id} version=${manifest.version}`);

    return this.rowToDto(row);
  }

  async getAll(): Promise<GamePackage[]> {
    const rows = await this.repository.findAll();
    return rows.map((r) => this.rowToDto(r));
  }

  async getEnabled(): Promise<GamePackage[]> {
    const cached = await this.redis.get(GAME_PACKAGES_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as GamePackage[];
    }

    const rows = await this.repository.findEnabled();
    const packages = rows.map((r) => this.rowToDto(r));
    await this.redis.set(GAME_PACKAGES_CACHE_KEY, JSON.stringify(packages), 'EX', GAME_PACKAGES_CACHE_TTL_S);
    return packages;
  }

  /** Invalidate the enabled packages cache. Call after any setEnabled or delete operation. */
  private async invalidateEnabledCache(): Promise<void> {
    await this.redis.del(GAME_PACKAGES_CACHE_KEY);
  }

  async setEnabled(id: string, isEnabled: boolean): Promise<GamePackage> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Game package "${id}" not found`);
    }
    const row = await this.repository.setEnabled(id, isEnabled);
    await this.invalidateEnabledCache();
    return this.rowToDto(row);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Game package "${id}" not found`);
    }
    await this.repository.delete(id);
    await this.invalidateEnabledCache();
    this.logger.log(`Game package deleted: id=${id}`);
  }

  private rowToDto(row: GamePackageRow): GamePackage {
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      description: row.description,
      isEnabled: row.is_enabled,
      manifest: row.manifest as GameManifest,
      bundleUrl: row.bundle_url,
      thumbnailUrl: row.thumbnail_url,
      createdAt: row.created_at.toISOString(),
    };
  }
}
