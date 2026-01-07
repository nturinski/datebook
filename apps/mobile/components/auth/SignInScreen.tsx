import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import React, { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { verifyProviderAndCreateSession } from "../../auth/authService";
import { PaperColors } from "@/constants/paper";

WebBrowser.maybeCompleteAuthSession();

type Props = {
  onSignedIn?: () => void; // navigation hook
};

export function SignInScreen({ onSignedIn }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);

  // NOTE: Expo's docs recommend using a Development Build for OAuth.
  // Expo Go can't reliably support custom schemes (and providers often require
  // exact redirect URI allowlisting), so consider a dev build if you hit issues.

  function googleRedirectUriForClientId(clientId: string | undefined): string | undefined {
    if (!clientId) return undefined;
    // Convert:
    //   1234-abc.apps.googleusercontent.com
    // to:
    //   com.googleusercontent.apps.1234-abc:/oauthredirect
    const id = clientId.replace(/\.apps\.googleusercontent\.com$/, "");
    return `com.googleusercontent.apps.${id}:/oauthredirect`;
  }

  const redirectUri = useMemo(() => {
    const native = Platform.select({
      ios: googleRedirectUriForClientId(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
      android: googleRedirectUriForClientId(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
      default: undefined,
    });

    return makeRedirectUri({
      scheme: "datebook",
      path: "oauthredirect",
      native,
    });
  }, []);

  // You MUST set these in app config / env for your platforms.
  const googleConfig = useMemo(() => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    // Force the account chooser every time. Otherwise the system browser
    // session may silently reuse the last signed-in Google user.
    const extraParams = {
      // Google OAuth supports space-separated values, e.g. "select_account consent".
      prompt: "select_account",
    } as const;

    return {
      // Used by the AuthSession proxy (Expo Go, and our Android dev fallback).
      expoClientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,

      // Used by native flows (standalone/dev-client).
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,

      // Used on web.
      webClientId,

      redirectUri,
      extraParams,
    };
  }, [redirectUri]);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(googleConfig);

  React.useEffect(() => {
    (async () => {
      if (response?.type !== "success") return;

      const idToken = response.params?.id_token;
      if (!idToken) {
        setError("Google sign-in succeeded, but no ID token was returned.");
        setBusy(null);
        return;
      }

      try {
        setError(null);
        await verifyProviderAndCreateSession("google", idToken);
        onSignedIn?.();
      } catch (e: any) {
        setError(e?.message ?? "Sign-in failed.");
      } finally {
        setBusy(null);
      }
    })();
  }, [response, onSignedIn]);

  async function signInWithGoogle() {
    try {
      setBusy("google");
      setError(null);
      // iOS: ask for an ephemeral browser session to avoid reusing cookies.
      // Other platforms ignore this option.
      await promptAsync({ preferEphemeralSession: true });
    } catch (e: any) {
      setError(e?.message ?? "Google sign-in failed.");
      setBusy(null);
    }
  }

  async function signInWithApple() {
    try {
      setBusy("apple");
      setError(null);

      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      if (!cred.identityToken) {
        throw new Error("Apple sign-in succeeded, but no identity token was returned.");
      }

      await verifyProviderAndCreateSession("apple", cred.identityToken);
      onSignedIn?.();
    } catch (e: any) {
      // Apple cancels are common; keep message gentle
      const msg = e?.message?.includes("ERR_CANCELED")
        ? "Apple sign-in cancelled."
        : (e?.message ?? "Apple sign-in failed.");
      setError(msg);
    } finally {
      setBusy(null);
    }
  }

  const googleDisabled = !request || busy !== null;
  const appleDisabled = busy !== null;

  return (
    <View style={styles.page}>
      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.title}>A scrapbook for real life.</Text>
          <Text style={styles.subtitle}>
            Sign in to start saving moments—ticket stubs optional.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Continue</Text>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              styles.googleButton,
              (pressed || busy === "google") && styles.buttonPressed,
              googleDisabled && styles.buttonDisabled,
            ]}
            onPress={signInWithGoogle}
            disabled={googleDisabled}
          >
            <View style={styles.buttonRow}>
              <Ionicons name="logo-google" size={18} color={INK} />
              <Text style={styles.buttonText}>Continue with Google</Text>
              {busy === "google" ? <ActivityIndicator /> : <View style={{ width: 18 }} />}
            </View>
          </Pressable>

          {Platform.OS === "ios" && (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                styles.appleButton,
                (pressed || busy === "apple") && styles.buttonPressed,
                appleDisabled && styles.buttonDisabled,
              ]}
              onPress={signInWithApple}
              disabled={appleDisabled}
            >
              <View style={styles.buttonRow}>
                <Ionicons name="logo-apple" size={18} color={INK} />
                <Text style={styles.buttonText}>Continue with Apple</Text>
                {busy === "apple" ? <ActivityIndicator /> : <View style={{ width: 18 }} />}
              </View>
            </Pressable>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Text style={styles.finePrint}>
            Warm beige UI. Charcoal ink. Muted accents. Your phone is now a tiny scrapbook.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Tip: if you’re developing locally, set EXPO_PUBLIC_API_BASE_URL.
          </Text>

          {__DEV__ ? (
            <Text style={styles.footerText}>
              OAuth redirect: {redirectUri}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ---- “paper + ink + muted accents” palette (from your doc) ----
const PAPER = PaperColors.paper;
const SAND = PaperColors.sand;
const INK = PaperColors.ink;
const LAVENDER = PaperColors.lavender;
const SAGE = PaperColors.sage;

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: SAND,
    padding: 18,
    justifyContent: "center",
  },
  paper: {
    backgroundColor: PAPER,
    borderRadius: 24,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(46,42,39,0.08)",
  },
  header: {
    marginBottom: 14,
  },
  kicker: {
    color: INK,
    opacity: 0.65,
    letterSpacing: 1.2,
    fontSize: 12,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    color: INK,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 32,
    marginBottom: 8,
  },
  subtitle: {
    color: INK,
    opacity: 0.7,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(46,42,39,0.10)",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardTitle: {
    color: INK,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  button: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(46,42,39,0.12)",
    marginBottom: 10,
  },
  googleButton: {
    backgroundColor: SAGE,
  },
  appleButton: {
    backgroundColor: LAVENDER,
  },
  buttonPressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.95,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  buttonText: {
    flex: 1,
    color: INK,
    fontSize: 15,
    fontWeight: "600",
  },
  error: {
    marginTop: 6,
    color: "#8B2E2E",
    fontSize: 13,
  },
  finePrint: {
    marginTop: 10,
    color: INK,
    opacity: 0.55,
    fontSize: 12,
    lineHeight: 16,
  },
  footer: {
    marginTop: 12,
    alignItems: "center",
  },
  footerText: {
    color: INK,
    opacity: 0.5,
    fontSize: 12,
  },
});
