import { Stack } from 'expo-router';

/**
 * Game screens are full-screen takeovers with no tab bar.
 * The Stack has no header — each game screen owns its own chrome.
 */
export default function GameLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
  );
}
