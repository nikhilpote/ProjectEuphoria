/**
 * Registry of Construct 3 game types.
 *
 * Games listed here use the local C3 SDK (c3runtime + Box2D) bundled in the app,
 * with game-specific assets (data.json, sprites, audio) loaded from the bundleUrl.
 *
 * The bundleUrl for C3 games points to a FOLDER (not a single index.html),
 * e.g. "https://cdn.euphoria.app/games/tap_tap_shoot/"
 *
 * To add a new C3 game:
 * 1. Strip the C3 SDK files (they're already in the app)
 * 2. Upload only game-specific files (data.json, images/, media/, fonts/, scripts/project/)
 * 3. Add the game type here
 */
export const C3_GAME_TYPES: Record<string, boolean> = {
  tap_tap_shoot: true,
};
