// Textpad for Expo: open text from a 256t link, edit it, and save it to
// the user's HashBin account.
//
// A walkthrough of this code is at https://hashbin.org/docs/textpad-expo

import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { HashBinAccount, NotConnectedError } from "./hashbin";
import { cidFromText, decodeText, inlineBytes, isValid256t } from "./textpad";

// ----------------------------------------------------------------------
// 1. Configuration
// ----------------------------------------------------------------------

// The HashBin service, and the domain that serves published content.
// Development only: EXPO_PUBLIC_HASHBIN_URL points the app at a local
// HashBin server (npm run dev:local), which serves content itself.
const HASHBIN_URL = process.env.EXPO_PUBLIC_HASHBIN_URL || "https://hashbin.org";
const CONTENT_URL = process.env.EXPO_PUBLIC_HASHBIN_URL || "https://256t.us";

// The client ID from registering Textpad at https://hashbin.org/developers,
// or EXPO_PUBLIC_TEXTPAD_CLIENT_ID for an app registered on a local server.
const CLIENT_ID = process.env.EXPO_PUBLIC_TEXTPAD_CLIENT_ID || "app_1a74e62b-d752-4a3c-81af-5c850af18c5b";

// HashBin sends the user back to this link after they approve Textpad. Its
// scheme is the app's own ("scheme" in app.json), so the system hands the
// link to this app. It must match a registered redirect URI exactly.
const REDIRECT_URI = "org.hashbin.textpad.expo://oauth";

// What Textpad asks the user to allow: publishing (billed to their
// balance) and reading their balance so it can be shown.
const SCOPES = ["content:write", "balance:read"];

const account = new HashBinAccount({
  clientId: CLIENT_ID,
  redirectUri: REDIRECT_URI,
  baseUrl: HASHBIN_URL,
  scopes: SCOPES
});

export default function App() {
  return (
    <SafeAreaProvider>
      <Textpad />
    </SafeAreaProvider>
  );
}

function Textpad() {
  // --------------------------------------------------------------------
  // 2. Screen state
  // --------------------------------------------------------------------

  // The text in the editor, and that text exactly as it was opened or last
  // saved under the 256t string currentCid. Comparing the two tells us
  // whether there are unsaved changes. savedText and currentCid are null
  // for a new, unsaved text.
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState(null);
  const [currentCid, setCurrentCid] = useState(null);

  // Set while a load or save is running, to ignore extra taps.
  const [busy, setBusy] = useState(false);

  // The message above the editor: { text, error, actions: [{ label, onPress }] }
  const [message, setMessage] = useState(null);

  const [connected, setConnected] = useState(false);
  const [accountLabel, setAccountLabel] = useState("");
  const [linkField, setLinkField] = useState("");

  const hasUnsavedChanges = text !== (savedText ?? "");

  function showMessage(messageText, { error = false, actions = [] } = {}) {
    setMessage({ text: messageText, error, actions });
  }

  function clearMessage() {
    setMessage(null);
  }

  // Shows text in the editor as the saved version of cid.
  function setDocument(cid, newText) {
    setCurrentCid(cid);
    setText(newText);
    setSavedText(newText);
  }

  // --------------------------------------------------------------------
  // 3. Opening a 256t link
  // --------------------------------------------------------------------

  // Asks before throwing away unsaved changes. Resolves to true to go on.
  function confirmDiscard() {
    if (!hasUnsavedChanges) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      Alert.alert("Discard your unsaved changes?", undefined, [
        { text: "Keep editing", style: "cancel", onPress: () => resolve(false) },
        { text: "Discard", style: "destructive", onPress: () => resolve(true) }
      ]);
    });
  }

  // Opens a deep link, a web Textpad link, a 256t.us link or a bare 256t
  // string. fromUser is true when it came from the "Open" field, where a
  // link without a 256t string deserves a message rather than silence.
  async function openLink(link, { fromUser = false } = {}) {
    const cid = cidFromText(link);
    if (cid === null) {
      if (fromUser) {
        showMessage("That link doesn't contain a 256t string.", { error: true });
      }
      return;
    }
    if (busy || !(await confirmDiscard())) {
      return;
    }
    setLinkField("");
    await openCid(cid);
  }

  async function openCid(cid) {
    // Whatever happens below, don't leave the previous text on screen as if
    // it belonged to this link.
    setDocument(null, "");
    clearMessage();

    if (cid === "") {
      showMessage("This link has \"256t=\" but no 256t string after it.", { error: true });
      return;
    }
    if (!isValid256t(cid)) {
      const shown = cid.length > 100 ? `${cid.slice(0, 100)}…` : cid;
      showMessage(`"${shown}" isn't a valid 256t string. Check that the link was copied completely.`, { error: true });
      return;
    }

    // Short texts are inside the 256t string itself.
    const inline = inlineBytes(cid);
    if (inline) {
      showText(cid, inline);
      return;
    }

    setBusy(true);
    showMessage("Loading…");
    try {
      let response;
      try {
        response = await fetch(`${CONTENT_URL}/${cid}`);
      } catch {
        showMessage("Couldn't reach HashBin to load this text. Check your connection and try again.", { error: true });
        return;
      }

      if (response.status === 404) {
        showMessage("Nothing is stored under this 256t string. It may have expired or been deleted, or it was never saved.", { error: true });
        return;
      }
      if (response.status === 451) {
        showMessage("This text is unavailable while a dispute about it is reviewed.", { error: true });
        return;
      }
      // Each stored text has a download allowance; when it runs out, 256t.us answers 429.
      if (response.status === 429) {
        showMessage("HashBin is limiting how often this text can be downloaded. Try again later.", { error: true });
        return;
      }
      if (!response.ok) {
        showMessage(`HashBin couldn't return this text (HTTP ${response.status}). Try again later.`, { error: true });
        return;
      }

      showText(cid, new Uint8Array(await response.arrayBuffer()));
    } finally {
      setBusy(false);
    }
  }

  function showText(cid, bytes) {
    try {
      setDocument(cid, decodeText(bytes));
      clearMessage();
    } catch {
      showMessage("This 256t string points to content that isn't text, so Textpad can't open it.", { error: true });
    }
  }

  // --------------------------------------------------------------------
  // 4. The user's HashBin account
  // --------------------------------------------------------------------

  async function showAccount() {
    const isConnected = account.isConnected();
    setConnected(isConnected);
    if (!isConnected) {
      setAccountLabel("Not connected to HashBin");
      return;
    }
    setAccountLabel("Connected to HashBin");
    try {
      const response = await account.fetch("/api/balance");
      if (response.ok) {
        const { balance_cents } = await response.json();
        setAccountLabel(`HashBin balance: $${(balance_cents / 100).toFixed(2)}`);
      }
    } catch (error) {
      if (error instanceof NotConnectedError) {
        showAccount();
      }
    }
  }

  async function disconnect() {
    await account.disconnect();
    showAccount();
  }

  // --------------------------------------------------------------------
  // 5. Saving text
  // --------------------------------------------------------------------

  async function save() {
    if (busy || !hasUnsavedChanges || text === "") {
      return;
    }
    // The editor is read-only while busy, so this is what gets saved.
    const textToSave = text;
    setBusy(true);
    try {
      // The first save asks the user to approve Textpad. Unlike a web page,
      // the app keeps running while the browser is open, so nothing has to
      // be stored to survive the trip.
      if (!account.isConnected()) {
        showMessage("Waiting for you to approve Textpad on HashBin…");
        const outcome = await account.connect();
        showAccount();
        if (outcome === "denied") {
          showMessage("You didn't approve Textpad on HashBin, so nothing was saved.", { error: true });
          return;
        }
        if (outcome === "cancelled") {
          clearMessage();
          return;
        }
      }

      showMessage("Saving…");
      // The request body is the text itself. Uploads made with an OAuth
      // app are kept for the user's default retention period (set on their
      // HashBin account page) and charged to their balance. Texts of 64
      // bytes or less are stored inside the 256t string and are free.
      const response = await account.fetch("/api/content", {
        method: "POST",
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: textToSave
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (result.error === "insufficient_balance") {
          showMessage(result.message || "Your HashBin balance is too low to save this.", {
            error: true,
            actions: [{ label: "Add funds", onPress: () => Linking.openURL(`${HASHBIN_URL}/deposit.html`) }]
          });
        } else {
          showMessage(`Saving failed: ${result.message || result.error || `HTTP ${response.status}`}`, { error: true });
        }
        return;
      }

      setCurrentCid(result.cid);
      setSavedText(textToSave);
      const expires = result.expires_at
        ? ` Kept until ${new Date(result.expires_at).toLocaleDateString()}.`
        : "";
      showMessage(`Saved.${expires}`, {
        actions: [
          { label: "Copy link", onPress: () => copyLink(result.cid) },
          { label: "View raw text", onPress: () => Linking.openURL(`${CONTENT_URL}/${result.cid}`) }
        ]
      });
      showAccount();
    } catch (error) {
      if (error instanceof NotConnectedError) {
        showAccount();
        showMessage("Your HashBin connection has ended. Tap Save to connect again.", { error: true });
      } else {
        showMessage(`Saving failed: ${error.message}`, { error: true });
      }
    } finally {
      setBusy(false);
    }
  }

  // A link to the web version of Textpad opens the text in any browser,
  // and pasting it into this app's "Open" field works too.
  async function copyLink(cid) {
    await Clipboard.setStringAsync(`${HASHBIN_URL}/docs/textpad/app#256t=${cid}`);
    showMessage("Link copied. Anyone with it can read this text.");
  }

  async function newDocument() {
    if (busy || !(await confirmDiscard())) {
      return;
    }
    setDocument(null, "");
    clearMessage();
  }

  // --------------------------------------------------------------------
  // 6. Wiring it together
  // --------------------------------------------------------------------

  // The link listener below is set up once, but openLink changes with
  // every render (it reads the current text). The ref always holds the
  // latest one.
  const openLinkRef = useRef(openLink);
  openLinkRef.current = openLink;

  useEffect(() => {
    // Start up: read saved tokens, then open the link that launched the
    // app, if any.
    (async () => {
      await account.load();
      showAccount();
      const initialLink = await Linking.getInitialURL();
      if (initialLink) {
        openLinkRef.current(initialLink);
      }
    })();

    // A 256t link opened while the app is already running.
    const subscription = Linking.addEventListener("url", ({ url }) => openLinkRef.current(url));
    return () => subscription.remove();
  }, []);

  // --------------------------------------------------------------------
  // 7. The screen
  // --------------------------------------------------------------------

  const colors = useColorScheme() === "dark" ? darkColors : lightColors;
  const styles = makeStyles(colors);

  let savedState = "";
  if (currentCid && !hasUnsavedChanges) {
    savedState = `Saved as 256t:${currentCid.slice(0, 12)}…`;
  } else if (currentCid) {
    savedState = "Unsaved changes";
  } else if (text) {
    savedState = "Not saved yet";
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Textpad</Text>
          <Text style={styles.muted} numberOfLines={1}>{accountLabel}</Text>
          {connected && <Button styles={styles} label="Disconnect" onPress={disconnect} />}
        </View>

        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.linkField]}
            value={linkField}
            onChangeText={setLinkField}
            placeholder="Paste a 256t string or link"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => openLink(linkField, { fromUser: true })}
          />
          <Button
            styles={styles}
            label="Open"
            disabled={busy || !linkField.trim()}
            onPress={() => openLink(linkField, { fromUser: true })}
          />
        </View>

        {message && (
          <View style={[styles.message, message.error && styles.error]} accessibilityLiveRegion="polite">
            <Text style={styles.messageText}>{message.text}</Text>
            {message.actions.length > 0 && (
              <View style={styles.actions}>
                {message.actions.map((action) => (
                  <Pressable key={action.label} onPress={action.onPress} accessibilityRole="link">
                    <Text style={styles.link}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        <TextInput
          style={[styles.input, styles.editor]}
          value={text}
          onChangeText={setText}
          editable={!busy}
          multiline
          textAlignVertical="top"
          placeholder="Type or paste text here."
          placeholderTextColor={colors.muted}
          accessibilityLabel="Text"
        />

        <View style={styles.row}>
          <Text style={[styles.muted, styles.savedState]} numberOfLines={1}>{savedState}</Text>
          <Button styles={styles} label="New" disabled={busy} onPress={newDocument} />
          <Button
            styles={styles}
            label="Save"
            primary
            disabled={busy || !hasUnsavedChanges || text === ""}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Button({ styles, label, onPress, disabled = false, primary = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primaryButton,
        (disabled || pressed) && styles.dimmed
      ]}
    >
      <Text style={[styles.buttonText, primary && styles.primaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

const lightColors = {
  background: "#ffffff",
  text: "#1f2328",
  muted: "#656d76",
  border: "#d0d7de",
  accent: "#0969da",
  error: "#cf222e",
  errorBackground: "#ffebe9",
  messageBackground: "#f6f8fa"
};

const darkColors = {
  background: "#0d1117",
  text: "#e6edf3",
  muted: "#8d96a0",
  border: "#30363d",
  accent: "#4493f8",
  error: "#f85149",
  errorBackground: "#2d1214",
  messageBackground: "#161b22"
};

function makeStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
    title: { fontSize: 20, fontWeight: "700", color: colors.text },
    muted: { flex: 1, color: colors.muted },
    row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: colors.text,
      fontSize: 16
    },
    linkField: { flex: 1 },
    editor: { flex: 1, marginHorizontal: 16, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
    message: {
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 10,
      borderRadius: 6,
      backgroundColor: colors.messageBackground,
      gap: 8
    },
    error: { backgroundColor: colors.errorBackground },
    messageText: { color: colors.text },
    actions: { flexDirection: "row", gap: 16 },
    link: { color: colors.accent, fontWeight: "600" },
    savedState: { fontSize: 13 },
    button: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
    primaryButton: { backgroundColor: colors.accent, borderColor: colors.accent },
    buttonText: { color: colors.text, fontWeight: "600" },
    primaryButtonText: { color: "#ffffff" },
    dimmed: { opacity: 0.5 }
  });
}
