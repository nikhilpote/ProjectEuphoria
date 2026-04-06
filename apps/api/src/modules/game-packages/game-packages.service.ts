import { Injectable, Logger, BadRequestException, NotFoundException, Inject, ConflictException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { lookup } from 'mime-types';
import AdmZip from 'adm-zip';
import Redis from 'ioredis';
import { GamePackagesRepository, GamePackageRow, GameLevelRow } from './game-packages.repository';
import { StorageService } from '../../common/storage/storage.service';
import { REDIS_CLIENT } from '../../database/redis.module';
import type { GamePackage, GameManifest, GameLevel } from '@euphoria/types';

/** TTL in seconds for the enabled game packages cache entry */
const GAME_PACKAGES_CACHE_TTL_S = 300;
const GAME_PACKAGES_CACHE_KEY = 'game_packages:enabled';

/** TTL for individual level cache — 10 min; invalidated on any write */
const LEVEL_CACHE_TTL_S = 600;
const levelCacheKey = (packageId: string, name: string) =>
  `game_level:${packageId}:${name}`;
const levelIdCacheKey = (id: string) => `game_level_id:${id}`;

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

    // Find manifest.json — handle both flat ZIPs (manifest.json at root)
    // and folder ZIPs where zip -r game/ produces game/manifest.json entries.
    let manifestEntry = zip.getEntry('manifest.json');
    let stripPrefix = '';
    if (!manifestEntry) {
      // Look for manifest.json inside a single top-level folder (e.g. trivia/manifest.json)
      manifestEntry = zip.getEntries().find(
        (e) => !e.isDirectory && /^[^/]+\/manifest\.json$/.test(e.entryName),
      ) ?? null;
      if (manifestEntry) {
        stripPrefix = manifestEntry.entryName.replace('manifest.json', ''); // e.g. "trivia/"
      }
    }

    if (!manifestEntry) {
      await fs.unlink(zipLocalPath).catch(() => undefined);
      throw new BadRequestException('ZIP must contain a manifest.json');
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

    // Upload all files to S3, stripping the top-level folder prefix if present
    const uploadedUrls = new Map<string, string>();
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory);

    await Promise.all(
      entries.map(async (entry) => {
        const relativeName = stripPrefix
          ? entry.entryName.startsWith(stripPrefix)
            ? entry.entryName.slice(stripPrefix.length)
            : entry.entryName
          : entry.entryName;
        if (!relativeName) return; // skip the root folder entry itself
        const mimeType = lookup(relativeName) || 'application/octet-stream';
        const key = `games/${manifest.id}/v${manifest.version}/${relativeName}`;
        const url = await this.storageService.uploadBuffer(entry.getData(), key, mimeType);
        uploadedUrls.set(relativeName, url);
        this.logger.debug(`Uploaded ${relativeName} -> ${url}`);
      }),
    );

    // Resolve bundle URL — look for index.html at root or inside web/ folder.
    let bundleUrl =
      uploadedUrls.get('web/index.html')
      ?? uploadedUrls.get('index.html')
      ?? null;

    if (!bundleUrl) {
      await fs.unlink(zipLocalPath).catch(() => undefined);
      throw new BadRequestException('ZIP must contain index.html or web/index.html as the bundle entry point');
    }

    // Resolve optional thumbnail
    const thumbnailUrl =
      uploadedUrls.get('thumbnail.png') ?? uploadedUrls.get('thumbnail.jpg') ?? null;

    // Delete the temp ZIP from disk
    await fs.unlink(zipLocalPath).catch((err: Error) =>
      this.logger.warn(`Failed to delete temp ZIP ${zipLocalPath}: ${err.message}`),
    );

    // Upsert: update existing row if present — preserves is_enabled and cascade-linked levels.
    // Never DELETE the package row on re-upload; levels are linked via FK and would be wiped.
    const existing = await this.repository.findById(manifest.id);
    const isEnabled = existing?.is_enabled ?? false;

    const row = await this.repository.upsert({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description ?? null,
      manifest,
      bundleUrl,
      thumbnailUrl,
      isEnabled,
    });

    await this.invalidateEnabledCache();

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

    // Delete all S3 objects for this package version (best-effort — never block the delete)
    if (existing.bundle_url) {
      await this.storageService.deleteGameBundle(existing.bundle_url).catch((err: Error) =>
        this.logger.warn(`S3 cleanup failed for package ${id}: ${err.message}`),
      );
    }

    await this.repository.delete(id);
    await this.invalidateEnabledCache();
    this.logger.log(`Game package deleted: id=${id}`);
  }

  // ── Level CRUD ────────────────────────────────────────────────────────────

  /**
   * Fetch a single level by name with Redis caching.
   * Returns null instead of throwing — callers decide how to handle missing levels.
   * Hot path: called on every spot_difference PlayClip submission.
   */
  async getLevelCached(gamePackageId: string, levelName: string): Promise<GameLevel | null> {
    const key = levelCacheKey(gamePackageId, levelName);
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as GameLevel;

    const row = await this.repository.findLevel(gamePackageId, levelName);
    if (!row) return null;

    const dto = this.levelToDto(row);
    await this.redis.set(key, JSON.stringify(dto), 'EX', LEVEL_CACHE_TTL_S);
    return dto;
  }

  /**
   * Fetch a single level by UUID with Redis caching.
   * This is the preferred lookup when configs store level.id (UUID).
   */
  async getLevelCachedById(levelId: string): Promise<GameLevel | null> {
    const key = levelIdCacheKey(levelId);
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as GameLevel;

    const row = await this.repository.findLevelById(levelId);
    if (!row) return null;

    const dto = this.levelToDto(row);
    await this.redis.set(key, JSON.stringify(dto), 'EX', LEVEL_CACHE_TTL_S);
    return dto;
  }

  private async invalidateLevelCache(gamePackageId: string, name: string): Promise<void> {
    await this.redis.del(levelCacheKey(gamePackageId, name));
  }

  async getLevels(gamePackageId: string): Promise<GameLevel[]> {
    const pkg = await this.repository.findById(gamePackageId);
    if (!pkg) throw new NotFoundException(`Game package "${gamePackageId}" not found`);
    const rows = await this.repository.findLevelsByPackage(gamePackageId);
    return rows.map((r) => this.levelToDto(r));
  }

  async getLevel(gamePackageId: string, levelName: string): Promise<GameLevel> {
    const row = await this.repository.findLevel(gamePackageId, levelName);
    if (!row) throw new NotFoundException(`Level "${levelName}" not found in "${gamePackageId}"`);
    return this.levelToDto(row);
  }

  async createLevel(gamePackageId: string, name: string, config: Record<string, unknown>): Promise<GameLevel> {
    const pkg = await this.repository.findById(gamePackageId);
    if (!pkg) throw new NotFoundException(`Game package "${gamePackageId}" not found`);
    const existing = await this.repository.findLevel(gamePackageId, name);
    if (existing) throw new BadRequestException(`Level "${name}" already exists in "${gamePackageId}"`);
    const row = await this.repository.createLevel({ gamePackageId, name, config });
    await this.invalidateLevelCache(gamePackageId, name);
    return this.levelToDto(row);
  }

  async updateLevel(gamePackageId: string, levelId: string, patch: { name?: string; config?: Record<string, unknown> }): Promise<GameLevel> {
    const row = await this.repository.updateLevel(levelId, patch);
    // Invalidate both old name (if renamed) and new name, plus ID-based cache
    await this.invalidateLevelCache(gamePackageId, row.name);
    if (patch.name && patch.name !== row.name) {
      await this.invalidateLevelCache(gamePackageId, patch.name);
    }
    await this.redis.del(levelIdCacheKey(levelId));
    return this.levelToDto(row);
  }

  async deleteLevel(gamePackageId: string, levelId: string): Promise<void> {
    // Fetch name before deleting so we can invalidate the cache
    const rows = await this.repository.findLevelsByPackage(gamePackageId);
    const target = rows.find((r) => r.id === levelId);
    await this.repository.deleteLevel(levelId);
    if (target) await this.invalidateLevelCache(gamePackageId, target.name);
    await this.redis.del(levelIdCacheKey(levelId));
  }

  private levelToDto(row: GameLevelRow): GameLevel {
    return {
      id: row.id,
      gamePackageId: row.game_package_id,
      name: row.name,
      config: row.config as Record<string, unknown>,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
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
