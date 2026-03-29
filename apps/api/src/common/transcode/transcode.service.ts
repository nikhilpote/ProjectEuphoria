import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { promises as fs } from 'fs';
import * as path from 'path';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v']);

/** Target bitrates for mobile-optimised output */
const VIDEO_BITRATE = '1200k';
const VIDEO_MAX_BITRATE = '1500k';
const VIDEO_BUFFER_SIZE = '3000k';
const AUDIO_BITRATE = '96k';

@Injectable()
export class TranscodeService {
  private readonly logger = new Logger(TranscodeService.name);

  /**
   * Re-encode a video file for low-bandwidth mobile delivery.
   *
   * - Target: ~1.2 Mbps video + 96 Kbps audio (~1.3 Mbps total)
   * - `-movflags +faststart`: moves moov atom to front so playback starts before full download
   * - Returns path to the transcoded file (caller is responsible for cleanup)
   * - Non-video files are returned unchanged (path passed through as-is)
   */
  async transcodeForMobile(inputPath: string, filename: string): Promise<string> {
    const ext = path.extname(filename).toLowerCase();

    if (!VIDEO_EXTENSIONS.has(ext)) {
      // Images and other files — pass through unchanged
      return inputPath;
    }

    const outputPath = inputPath.replace(/(\.[\w]+)$/, '_tc$1');

    this.logger.log(`Transcoding ${filename} → mobile profile (1.2 Mbps)`);
    const start = Date.now();

    await this.runFfmpeg(inputPath, outputPath);

    const [inputStat, outputStat] = await Promise.all([
      fs.stat(inputPath),
      fs.stat(outputPath),
    ]);

    const saved = (((inputStat.size - outputStat.size) / inputStat.size) * 100).toFixed(1);
    this.logger.log(
      `Transcode done in ${Date.now() - start}ms — ` +
      `${(inputStat.size / 1024 / 1024).toFixed(1)} MB → ` +
      `${(outputStat.size / 1024 / 1024).toFixed(1)} MB (${saved}% smaller)`,
    );

    // Delete the original upload, replace with transcoded version
    await fs.unlink(inputPath).catch(() => {});

    return outputPath;
  }

  private runFfmpeg(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .videoBitrate(VIDEO_BITRATE)
        .addOption('-maxrate', VIDEO_MAX_BITRATE)
        .addOption('-bufsize', VIDEO_BUFFER_SIZE)
        .audioCodec('aac')
        .audioBitrate(AUDIO_BITRATE)
        .addOption('-movflags', '+faststart')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });
  }
}
