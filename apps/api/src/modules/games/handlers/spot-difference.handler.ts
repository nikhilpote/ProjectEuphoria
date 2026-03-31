import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer } from '@euphoria/types';

interface Difference {
  x: number;
  y: number;
  radius: number;
}

interface SpotDiffAnswer {
  found?: boolean;
  taps?: Array<{ x: number; y: number }>;
}

/**
 * Server-side tap validation — mirrors pixel-space hit detection in the game client.
 * radius is stored as a fraction of image width; to produce circular (not elliptical)
 * hit zones, distances are compared in pixel space using the image aspect ratio.
 *
 * aspectRatio = imageWidth / imageHeight (stored in level config).
 * Defaults to 1 (square) for backward compatibility with levels created before this fix.
 */
export function validateSpotDifferenceTaps(
  differences: Difference[],
  findCount: number,
  taps: Array<{ x: number; y: number }>,
  aspectRatio: number = 1,
): boolean {
  // In normalized 0-1 space, converting to pixel space:
  //   pixelDx = dx * imageWidth   pixelDy = dy * imageHeight
  // radius (fraction of width) in pixels = radius * imageWidth
  // Hit: sqrt((dx*W)^2 + (dy*H)^2) <= radius*W
  // Divide by W: sqrt(dx^2 + (dy * H/W)^2) <= radius
  //              sqrt(dx^2 + (dy / aspectRatio)^2) <= radius
  const invAr = 1 / (aspectRatio > 0 ? aspectRatio : 1);

  let found = 0;
  const used = new Set<number>();
  for (const tap of taps) {
    for (let i = 0; i < differences.length; i++) {
      if (used.has(i)) continue;
      const d = differences[i];
      const dx = tap.x - d.x;
      const dy = (tap.y - d.y) * invAr;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= (d.radius ?? 0.07)) {
        used.add(i);
        found++;
        break;
      }
    }
    if (found >= findCount) return true;
  }
  return false;
}

interface InlineSpotDifference {
  imageA: string;
  imageB: string;
  differences: Difference[];
  findCount: number;
}

export class SpotDifferenceHandler extends BaseGameHandler {
  readonly type = 'spot_difference';

  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const sd = config['spotDifference'] as (InlineSpotDifference & { imageAspectRatio?: number }) | undefined;
    if (!sd) return {};
    return {
      imageA: sd.imageA,
      imageB: sd.imageB,
      differences: sd.differences,
      findCount: sd.findCount ?? 1,
      ...(sd.imageAspectRatio !== undefined ? { imageAspectRatio: sd.imageAspectRatio } : {}),
    };
  }

  buildQuestionEvent(
    config: Record<string, unknown>,
    { showId, roundIndex, timeLimitMs }: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown> {
    const sd = config['spotDifference'] as (InlineSpotDifference & { imageAspectRatio?: number }) | undefined;
    if (!sd) return {};
    return {
      showId,
      roundIndex,
      timeLimitMs,
      imageA: sd.imageA,
      imageB: sd.imageB,
      differences: sd.differences,       // client needs these for hit detection
      findCount: sd.findCount ?? 1,
      ...(sd.imageAspectRatio !== undefined ? { imageAspectRatio: sd.imageAspectRatio } : {}),
    };
  }

  isCorrect(config: Record<string, unknown>, answer: GameAnswer): boolean {
    const submitted = answer as SpotDiffAnswer | null;
    if (!submitted) return false;

    // Server-side validation: orchestrator pre-resolves level and injects
    // _resolvedDifferences + _resolvedFindCount into config before calling isCorrect.
    const diffsRaw = config['_resolvedDifferences'] as string | undefined;
    const findCount = (config['_resolvedFindCount'] as number | undefined) ?? 1;
    const aspectRatio = (config['_resolvedAspectRatio'] as number | undefined) ?? 1;
    if (diffsRaw && submitted.taps) {
      try {
        const diffs = JSON.parse(diffsRaw) as Difference[];
        return validateSpotDifferenceTaps(diffs, findCount, submitted.taps, aspectRatio);
      } catch {
        // malformed stored data — fail closed
        return false;
      }
    }

    // Fallback: trust client flag (should not reach here in normal flow)
    return submitted.found === true;
  }

  getCorrectAnswerText(_config: Record<string, unknown>): string {
    return 'Find the difference';
  }
}
