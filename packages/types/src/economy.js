"use strict";
/**
 * Coin economy / wallet types
 *
 * CONSTRAINT: All wallet mutations require an idempotency key.
 * Pattern: `{type}:{referenceId}:{userId}`
 * Double-processing returns the existing transaction — never a duplicate.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=economy.js.map