/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

import { PaperColors } from './paper';

// App-wide “paper + ink” theme.
// Light mode matches SignInScreen; dark mode is a higher-contrast inverse.
const tintColorLight = PaperColors.ink;
const tintColorDark = PaperColors.paper;

export const Colors = {
  light: {
    text: PaperColors.ink,
    background: PaperColors.sand,
    tint: tintColorLight,
    icon: 'rgba(46,42,39,0.55)',
    tabIconDefault: 'rgba(46,42,39,0.55)',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: PaperColors.paper,
    background: '#1B1815',
    tint: tintColorDark,
    icon: 'rgba(246,239,230,0.70)',
    tabIconDefault: 'rgba(246,239,230,0.70)',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
