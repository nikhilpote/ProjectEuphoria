"use strict";
/**
 * @euphoria/types — Shared TypeScript types for the Euphoria platform
 *
 * All exports are pure types — no runtime code.
 * Safe to import in both server (NestJS) and client (React Native) contexts.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./user.js"), exports);
__exportStar(require("./games.js"), exports);
__exportStar(require("./show.js"), exports);
__exportStar(require("./economy.js"), exports);
__exportStar(require("./playclips.js"), exports);
__exportStar(require("./socket-events.js"), exports);
__exportStar(require("./api.js"), exports);
//# sourceMappingURL=index.js.map