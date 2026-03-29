"use strict";
/**
 * WebSocket event contracts for the Euphoria platform.
 *
 * Naming convention:
 *   - Server -> Client: descriptive past-tense or noun events
 *   - Client -> Server: imperative verb events
 *
 * SECURITY NOTE: round_start events NEVER contain encrypted answer fields.
 * round_result events contain plaintext correct answer ONLY after submission window.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=socket-events.js.map