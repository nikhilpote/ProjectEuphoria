import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getGameRenderer } from './registry';
import { GameWebViewBridge } from './GameWebViewBridge';
import type { GameRendererProps } from './types';

/**
 * Dispatches to the correct game renderer based on gameType.
 * - bundleUrl present: renders via WebView bridge (standard + C3 games).
 * - Otherwise falls back to the native registry (TriviaGame, QuickMathGame, etc.).
 * - Shows a friendly fallback if the game type is unknown.
 *
 * C3 games bundle their own index.html + SDK on CDN for now.
 * Future: local SDK optimization via C3GameWebViewBridge after native build.
 */
export function GameRenderer(props: GameRendererProps) {
  // WebView path: bundleUrl points to index.html (works for both standard + C3 games)
  if (props.bundleUrl) {
    return (
      <GameWebViewBridge
        bundleUrl={props.bundleUrl}
        payload={props.payload}
        timeLimitMs={props.timeLimitMs}
        onSubmit={props.onSubmit}
        isLocked={props.isLocked}
      />
    );
  }

  // Native fallback for games without a bundle URL
  const Renderer = getGameRenderer(props.gameType);

  if (!Renderer) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>Game type not supported</Text>
        <Text style={styles.fallbackSub}>Update the app to play {props.gameType}</Text>
      </View>
    );
  }

  return <Renderer {...props} />;
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: 'rgba(10,10,15,0.95)',
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E8E8F0',
    textAlign: 'center',
  },
  fallbackSub: {
    fontSize: 14,
    color: '#6B6B8A',
    marginTop: 8,
    textAlign: 'center',
  },
});
