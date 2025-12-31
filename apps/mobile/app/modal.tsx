import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PaperColors } from '@/constants/paper';

export default function ModalScreen() {
  return (
    <View style={styles.page}>
      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.title}>Modal</Text>
          <Text style={styles.subtitle}>A simple in-app modal route.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.body}>You can use this route for confirmations, editors, etc.</Text>

          <Link href="/" dismissTo asChild>
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
              <Text style={styles.buttonText}>Go to home screen</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: PaperColors.sand,
    padding: 18,
    justifyContent: 'center',
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
    gap: 14,
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
    gap: 12,
  },
  body: {
    color: PaperColors.ink,
    opacity: 0.82,
    lineHeight: 20,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
    backgroundColor: PaperColors.sage,
  },
  buttonPressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.95,
  },
  buttonText: {
    fontWeight: '700',
    color: PaperColors.ink,
  },
});
