// NOTE: react-native-webview is not yet in package.json.
// Add it with: npx expo install react-native-webview

import React, { useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewErrorEvent } from 'react-native-webview';
import type { GameAnswer } from '@euphoria/types';

export interface GameWebViewBridgeProps {
  bundleUrl: string;
  payload: Record<string, unknown>;
  timeLimitMs: number;
  onSubmit: (answer: GameAnswer) => void;
  isLocked: boolean;
}

export function GameWebViewBridge({
  bundleUrl,
  payload,
  timeLimitMs,
  onSubmit,
  isLocked,
}: GameWebViewBridgeProps) {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);

  // Encode payload into URL hash so the game can read it from location.hash
  // without relying on injectedJS or message events (which fail on some WebViews).
  const gameData = JSON.stringify({ payload, timeLimitMs });
  const sourceUrlRef = useRef(bundleUrl + '#' + encodeURIComponent(gameData));

  // Injected before page content loads — sets global + console forwarding.
  // This is a best-effort fallback; the URL hash is the primary data channel.
  const injectedJS = `
    window.__EUPHORIA_GAME__ = ${JSON.stringify({ payload, timeLimitMs })};
    true;
  `;

  const handleLoadEnd = () => {
    console.log('[GameWebViewBridge] onLoadEnd fired');
    // Also try setting the global via injectJavaScript as another fallback
    webViewRef.current?.injectJavaScript(`
      window.__EUPHORIA_GAME__ = ${JSON.stringify({ payload, timeLimitMs })};
      window.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify({ type: 'GAME_INIT', payload: ${JSON.stringify({ ...payload, timeLimitMs })} })
      }));
      true;
    `);
    setLoading(false);
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string; level?: string; msg?: string; payload?: unknown };

      if (msg.type === '__CONSOLE__') {
        const prefix = `[WebView:${msg.level}]`;
        if (msg.level === 'error') console.error(prefix, msg.msg);
        else if (msg.level === 'warn') console.warn(prefix, msg.msg);
        else console.log(prefix, msg.msg);
        return;
      }

      if (msg.type === 'READY') {
        setLoading(false);
        return;
      }

      if (msg.type === 'SUBMIT_ANSWER' && !isLocked) {
        onSubmit(msg.payload as GameAnswer);
      }
    } catch {
      // Ignore malformed messages from third-party web content
    }
  };

  const handleError = (e: WebViewErrorEvent) => {
    console.error('[GameWebViewBridge] WebView error:', e.nativeEvent.description, 'url=', e.nativeEvent.url);
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: sourceUrlRef.current }}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onError={handleError}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        scrollEnabled={false}
        bounces={false}
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
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D0D1A',
  },
});
