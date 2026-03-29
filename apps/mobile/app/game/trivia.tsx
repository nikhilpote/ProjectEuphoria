/**
 * Trivia Game — placeholder until EAS dev build with Reanimated 4 native support.
 */
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TriviaGameScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🎮</Text>
        <Text style={styles.title}>Trivia</Text>
        <Text style={styles.subtitle}>
          Full game engine coming in the next build.{'\n'}
          Running in Expo Go — native animations require a dev build.
        </Text>
        <Pressable style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#FFFFFF', marginBottom: 12 },
  subtitle: { fontSize: 15, color: '#6B6B8A', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  button: { backgroundColor: '#7C3AED', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
