import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { PaperColors } from '@/constants/paper';

export default function TabTwoScreen() {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.title}>Explore</Text>
          <Text style={styles.subtitle}>A few handy links and notes while you’re building.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>File-based routing</Text>
          <Text style={styles.body}>
            This app uses Expo Router. Your tab screens live in{' '}
            <Text style={styles.mono}>app/(tabs)</Text>.
          </Text>
          <ExternalLink href="https://docs.expo.dev/router/introduction">
            <Text style={styles.link}>Expo Router docs</Text>
          </ExternalLink>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Images</Text>
          <Text style={styles.body}>Use @2x / @3x assets for crisp rendering across densities.</Text>
          <Image
            source={require('@/assets/images/react-logo.png')}
            style={{ width: 90, height: 90, alignSelf: 'center' }}
          />
          <ExternalLink href="https://reactnative.dev/docs/images">
            <Text style={styles.link}>React Native Images docs</Text>
          </ExternalLink>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Color themes</Text>
          <Text style={styles.body}>
            We support light/dark mode. The theme colors are in{' '}
            <Text style={styles.mono}>constants/theme.ts</Text>.
          </Text>
          <ExternalLink href="https://docs.expo.dev/develop/user-interface/color-themes/">
            <Text style={styles.link}>Expo color themes guide</Text>
          </ExternalLink>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Animations</Text>
          <Text style={styles.body}>
            <Text style={styles.mono}>react-native-reanimated</Text> powers the parallax header and
            other animations.
          </Text>
          <ExternalLink href="https://docs.swmansion.com/react-native-reanimated/">
            <Text style={styles.link}>Reanimated docs</Text>
          </ExternalLink>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: PaperColors.sand,
  },
  pageContent: {
    padding: 18,
  },
  paper: {
    backgroundColor: PaperColors.paper,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(46,42,39,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    gap: 12,
  },
  header: {
    gap: 6,
  },
  kicker: {
    color: PaperColors.ink,
    opacity: 0.65,
    letterSpacing: 1.2,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  title: {
    color: PaperColors.ink,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  subtitle: {
    color: PaperColors.ink,
    opacity: 0.7,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: PaperColors.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: PaperColors.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    gap: 10,
  },
  cardTitle: {
    color: PaperColors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    color: PaperColors.ink,
    opacity: 0.82,
    lineHeight: 20,
  },
  mono: {
    fontFamily: 'monospace',
    color: PaperColors.ink,
    opacity: 0.9,
  },
  link: {
    textDecorationLine: 'underline',
    fontWeight: '600',
    color: PaperColors.ink,
    opacity: 0.9,
  },
});
