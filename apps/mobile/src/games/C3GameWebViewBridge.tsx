/**
 * C3GameWebViewBridge
 *
 * Loads Construct 3 + Box2D games using the local c3-sdk (bundled in app)
 * and fetches game-specific assets (data.json, sprites, audio) from a remote URL.
 *
 * Usage:
 *   <C3GameWebViewBridge
 *     gameBaseUrl="https://cdn.euphoria.app/games/tap_tap_shoot/"
 *     payload={{ requiredLevel: 4 }}
 *     timeLimitMs={60000}
 *     onSubmit={handleAnswer}
 *     isLocked={false}
 *   />
 */

import React, { useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewErrorEvent } from 'react-native-webview';
import type { GameAnswer } from '@euphoria/types';
import * as FileSystem from 'expo-file-system';

// Local c3-sdk loader HTML — bundled in app assets via expo-asset plugin
const C3_LOADER_ANDROID = 'file:///android_asset/c3-sdk/c3-loader.html';
const C3_LOADER_IOS = `${FileSystem.bundleDirectory ?? ''}c3-sdk/c3-loader.html`;

export interface C3GameWebViewBridgeProps {
  gameBaseUrl: string;
  payload: Record<string, unknown>;
  timeLimitMs: number;
  onSubmit: (answer: GameAnswer) => void;
  isLocked: boolean;
}

export function C3GameWebViewBridge({
  gameBaseUrl,
  payload,
  timeLimitMs,
  onSubmit,
  isLocked,
}: C3GameWebViewBridgeProps) {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);

  // Ensure gameBaseUrl ends with /
  const baseUrl = gameBaseUrl.endsWith('/') ? gameBaseUrl : gameBaseUrl + '/';

  // Build the source URI: local c3-loader.html with gameBaseUrl as query param
  // and game payload in the hash
  const gameData = JSON.stringify({ payload: { ...payload, timeLimitMs } });
  const loaderUrl =
    Platform.OS === 'android' ? C3_LOADER_ANDROID : C3_LOADER_IOS;
  const sourceUri = `${loaderUrl}?gameBaseUrl=${encodeURIComponent(baseUrl)}#${encodeURIComponent(gameData)}`;

  const injectedJS = `
    window.__EUPHORIA_GAME__ = ${JSON.stringify({ payload: { ...payload, timeLimitMs } })};
    true;
  `;

  const handleLoadEnd = () => {
    setLoading(false);
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type: string;
        payload?: unknown;
      };

      if (msg.type === 'READY') {
        setLoading(false);
        return;
      }

      if (msg.type === 'SUBMIT_ANSWER' && !isLocked) {
        onSubmit(msg.payload as GameAnswer);
      }
    } catch {
      // Ignore malformed messages
    }
  };

  const handleError = (e: WebViewErrorEvent) => {
    console.error(
      '[C3GameWebViewBridge] Error:',
      e.nativeEvent.description,
      'url=',
      e.nativeEvent.url
    );
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: sourceUri }}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onError={handleError}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        scrollEnabled={false}
        bounces={false}
        // Android: allow local file:// to fetch from https://
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        // iOS: allow reading local c3-sdk assets
        allowingReadAccessToURL={
          Platform.OS === 'ios' ? 'file://' : undefined
        }
        style={styles.webView}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: '#0D0D1A',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D0D1A',
  },
});
