/**
 * Game type definitions for all mini-games supported by Euphoria.
 *
 * SECURITY NOTE: Correct answers are AES-256 encrypted at rest.
 * The `correctAnswer` field on server-side types is always the encrypted
 * ciphertext. Plaintext is only revealed in round_result events after
 * the submission window closes.
 */
export type GameType = 'trivia' | 'spot_difference' | 'quick_math' | 'spelling_bee' | 'fruit_cutting' | 'knife_at_center' | 'find_items';
export interface TriviaOption {
    id: string;
    text: string;
}
export interface TriviaConfig {
    gameType: 'trivia';
    question: string;
    options: [TriviaOption, TriviaOption, TriviaOption, TriviaOption];
    /** Encrypted ciphertext of the correct option id. Server-side only. */
    correctAnswerEncrypted: string;
    timeLimitMs: number;
}
export interface TriviaAnswer {
    gameType: 'trivia';
    selectedOptionId: string;
}
export interface SpotDifferenceConfig {
    gameType: 'spot_difference';
    imageAUrl: string;
    imageBUrl: string;
    /** Number of differences to find */
    totalDifferences: number;
    /** Encrypted JSON array of bounding boxes [{x,y,w,h}]. Server-side only. */
    differencesEncrypted: string;
    timeLimitMs: number;
}
export interface BoundingBox {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface SpotDifferenceAnswer {
    gameType: 'spot_difference';
    /** Client-reported tap coordinates, normalized 0-1 */
    taps: Array<{
        x: number;
        y: number;
    }>;
}
export interface QuickMathConfig {
    gameType: 'quick_math';
    expression: string;
    /** Encrypted numeric string. Server-side only. */
    correctAnswerEncrypted: string;
    timeLimitMs: number;
}
export interface QuickMathAnswer {
    gameType: 'quick_math';
    value: number;
}
export interface SpellingBeeConfig {
    gameType: 'spelling_bee';
    audioUrl: string;
    hint?: string;
    /** Encrypted correct spelling. Server-side only. */
    correctAnswerEncrypted: string;
    timeLimitMs: number;
}
export interface SpellingBeeAnswer {
    gameType: 'spelling_bee';
    spelling: string;
}
export interface FruitCuttingConfig {
    gameType: 'fruit_cutting';
    /** Target fruit types that must be cut */
    targetFruits: string[];
    /** Bomb types that must NOT be cut */
    bombs: string[];
    timeLimitMs: number;
    /** Minimum cut accuracy 0-1 to pass */
    passingAccuracy: number;
}
export interface FruitCuttingAnswer {
    gameType: 'fruit_cutting';
    /** Fraction of target fruits successfully cut, 0-1 */
    accuracy: number;
    /** Whether any bomb was cut */
    hitBomb: boolean;
}
export interface KnifeAtCenterConfig {
    gameType: 'knife_at_center';
    /** Target zone radius as fraction of total range, 0-1 */
    targetZoneRadius: number;
    /** Number of attempts allowed */
    attempts: number;
    timeLimitMs: number;
}
export interface KnifeAtCenterAnswer {
    gameType: 'knife_at_center';
    /** Normalized stop position 0-1 per attempt */
    stops: number[];
}
export interface FindItemsConfig {
    gameType: 'find_items';
    sceneImageUrl: string;
    itemsToFind: Array<{
        id: string;
        label: string;
        thumbnailUrl: string;
    }>;
    /** Encrypted JSON array of bounding boxes keyed by item id. Server-side only. */
    itemLocationsEncrypted: string;
    timeLimitMs: number;
}
export interface FindItemsAnswer {
    gameType: 'find_items';
    /** Map of itemId -> tap coordinates (normalized 0-1) */
    taps: Record<string, {
        x: number;
        y: number;
    }>;
}
export type GameConfig = TriviaConfig | SpotDifferenceConfig | QuickMathConfig | SpellingBeeConfig | FruitCuttingConfig | KnifeAtCenterConfig | FindItemsConfig;
export type GameAnswer = TriviaAnswer | SpotDifferenceAnswer | QuickMathAnswer | SpellingBeeAnswer | FruitCuttingAnswer | KnifeAtCenterAnswer | FindItemsAnswer;
export interface GameDefinition {
    id: string;
    gameType: GameType;
    config: GameConfig;
    difficulty: 'easy' | 'medium' | 'hard';
}
export interface RoundResult {
    roundIndex: number;
    gameType: GameType;
    /** Plaintext correct answer — only sent in round_result event AFTER window closes */
    correctAnswer: unknown;
    playerCount: number;
    eliminatedCount: number;
}
/**
 * A trivia question safe to send to clients.
 * correct_index is intentionally absent — it never leaves the server.
 */
export interface TriviaQuestionPublic {
    id: string;
    question: string;
    /** Four answer options in order. Index mapping is server-side only. */
    options: string[];
    category: string;
    difficulty: number;
    /** Sourced from feature flag trivia_time_limit_ms at request time. */
    timeLimitMs: number;
}
/** Returned by POST /games/trivia/validate */
export interface TriviaAnswerResult {
    correct: boolean;
    correctIndex: number;
    pointsEarned: number;
    responseTimeMs: number;
}
/** Request body for POST /games/trivia/validate */
export interface TriviaValidatePayload {
    questionId: string;
    selectedIndex: number;
    /** Client-reported Unix ms timestamp of when the answer was submitted */
    clientTimestamp: number;
}
//# sourceMappingURL=games.d.ts.map