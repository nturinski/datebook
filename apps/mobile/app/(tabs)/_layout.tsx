import { Tabs } from 'expo-router';
import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PaperColors } from '@/constants/paper';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: colorScheme === 'dark' ? '#1B1815' : PaperColors.paper,
          borderTopColor: colorScheme === 'dark' ? 'rgba(246,239,230,0.12)' : PaperColors.border,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Timeline',
          tabBarIcon: ({ color, focused, size }) => (
            <FontAwesome name={focused ? 'clock-o' : 'clock-o'} size={size ?? 28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="scrapbooks"
        options={{
          title: 'Scrapbooks',
          tabBarIcon: ({ color, focused, size }) => (
            <FontAwesome name={focused ? 'book' : 'book'} size={size ?? 28} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="relationships"
        options={{
          title: 'Relationships',
          tabBarIcon: ({ color, focused, size }) => (
          <FontAwesome
            name={focused ? 'heart' : 'heart-o'} // optional: filled vs outline
            size={size ?? 28}
            color={color}
          />
          ),
      }}
      />
    </Tabs>
  );
}
