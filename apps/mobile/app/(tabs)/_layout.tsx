import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';

const COLORS = {
  bg: '#0A0A0F',
  surface: '#13131A',
  border: '#2A2A3D',
  accent: '#7C3AED',
  muted: '#6B6B8A',
  white: '#FFFFFF',
} as const;

function TabBarIcon({ focused, label }: { focused: boolean; label: string }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      {/* Text-based icons — replace with SVGs when design assets are ready */}
      <View
        style={[styles.tabDot, focused && styles.tabDotActive]}
      />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabBarIcon focused={focused} label="home" />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    height: Platform.OS === 'ios' ? 84 : 64,
    paddingTop: 8,
  },
  tabItem: {
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  tabIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: {},
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.muted,
  },
  tabDotActive: {
    backgroundColor: COLORS.accent,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
