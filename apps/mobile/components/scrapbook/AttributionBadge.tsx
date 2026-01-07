import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PaperColors } from '@/constants/paper';

export function AttributionBadge(props: {
  text: string;
  size?: number;
  counterRotationDeg?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { text, size = 18, counterRotationDeg = 0, style } = props;

  const label = (typeof text === 'string' && text.trim().length ? text.trim() : '?').slice(0, 2).toUpperCase();
  const fontSize = Math.max(10, Math.round(size * 0.55));

  return (
    <View
      pointerEvents="none"
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: counterRotationDeg ? [{ rotate: `${counterRotationDeg}deg` }] : undefined,
        },
        style,
      ]}
    >
      <Text style={[styles.badgeText, { fontSize }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250, 248, 244, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(46,42,39,0.20)',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  badgeText: {
    color: PaperColors.ink,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});
