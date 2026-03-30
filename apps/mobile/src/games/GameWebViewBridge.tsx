// NOTE: react-native-webview is not yet in package.json.
// Add it with: npx expo install react-native-webview

import React, { useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
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

  // Injected before page content loads so the game can read it synchronously
  const injectedJS = `
    window.__EUPHORIA_GAME__ = ${JSON.stringify({ payload, timeLimitMs })};
    true;
  `;

  const handleLoadEnd = () => {
    // Dispatch GAME_INIT after the page is ready so frameworks that register
    // message listeners in DOMContentLoaded/useEffect can receive it
    webViewRef.current?.injectJavaScript(`
      window.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify({ type: 'GAME_INIT', payload: ${JSON.stringify({ ...payload, timeLimitMs })} })
      }));
      true;
    `);
    setLoading(false);
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string; payload?: unknown };

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

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: bundleUrl }}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
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
