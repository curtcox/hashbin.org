// Textpad for Flutter: open text from a 256t link, edit it, and save it to
// the user's HashBin account.
//
// A walkthrough of this code is at https://hashbin.org/docs/textpad-flutter

import 'dart:async';
import 'dart:convert';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import 'hashbin.dart';
import 'textpad.dart';

// ----------------------------------------------------------------------
// 1. Configuration
// ----------------------------------------------------------------------

// The HashBin service, and the domain that serves published content.
// Development only: --dart-define=HASHBIN_URL=... points the app at a local
// HashBin server (npm run dev:local), which serves content itself.
const hashbinUrl = String.fromEnvironment('HASHBIN_URL', defaultValue: 'https://hashbin.org');
const contentUrl = String.fromEnvironment('HASHBIN_URL', defaultValue: 'https://256t.us');

// The client ID from registering Textpad at https://hashbin.org/developers,
// or --dart-define=TEXTPAD_CLIENT_ID=... for an app registered on a local
// server.
const clientId = String.fromEnvironment(
  'TEXTPAD_CLIENT_ID',
  defaultValue: 'app_1a74e62b-d752-4a3c-81af-5c850af18c5b',
);

// HashBin sends the user back to this link after they approve Textpad. Its
// scheme is the app's own, so the system hands the link to this app. It
// must match a registered redirect URI exactly.
const redirectUri = 'org.hashbin.textpad.flutter://oauth';

// What Textpad asks the user to allow: publishing (billed to their
// balance) and reading their balance so it can be shown.
const scopes = ['content:write', 'balance:read'];

final account = HashBinAccount(
  clientId: clientId,
  redirectUri: redirectUri,
  baseUrl: hashbinUrl,
  scopes: scopes,
);

void main() => runApp(const TextpadApp());

class TextpadApp extends StatelessWidget {
  const TextpadApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Textpad',
      theme: ThemeData(colorSchemeSeed: Colors.blue),
      darkTheme: ThemeData(colorSchemeSeed: Colors.blue, brightness: Brightness.dark),
      home: const TextpadScreen(),
    );
  }
}

/// The message above the editor, with optional buttons such as "Add funds".
class Message {
  const Message(this.text, {this.error = false, this.actions = const []});
  final String text;
  final bool error;
  final List<(String, VoidCallback)> actions;
}

class TextpadScreen extends StatefulWidget {
  const TextpadScreen({super.key});

  @override
  State<TextpadScreen> createState() => _TextpadScreenState();
}

class _TextpadScreenState extends State<TextpadScreen> {
  // --------------------------------------------------------------------
  // 2. Screen state
  // --------------------------------------------------------------------

  final editor = TextEditingController();
  final linkField = TextEditingController();

  // The 256t string of the text in the editor, and that text exactly as it
  // was opened or last saved. Comparing it with the editor tells us whether
  // there are unsaved changes. Both are null for a new, unsaved text.
  String? currentCid;
  String? savedText;

  // Set while a load or save is running, to ignore extra taps.
  bool busy = false;

  Message? message;
  bool connected = false;
  String accountLabel = '';
  StreamSubscription<String>? linkSubscription;

  bool get hasUnsavedChanges => editor.text != (savedText ?? '');

  void showMessage(String text, {bool error = false, List<(String, VoidCallback)> actions = const []}) {
    setState(() => message = Message(text, error: error, actions: actions));
  }

  void clearMessage() => setState(() => message = null);

  void setBusy(bool value) => setState(() => busy = value);

  /// Shows text in the editor as the saved version of cid.
  void setDocument(String? cid, String text) {
    editor.text = text;
    setState(() {
      currentCid = cid;
      savedText = text;
    });
  }

  // --------------------------------------------------------------------
  // 3. Opening a 256t link
  // --------------------------------------------------------------------

  /// Asks before throwing away unsaved changes. Returns true to go on.
  Future<bool> confirmDiscard() async {
    if (!hasUnsavedChanges) return true;
    final discard = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Discard your unsaved changes?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep editing')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Discard')),
        ],
      ),
    );
    return discard ?? false;
  }

  /// Opens a deep link, a web Textpad link, a 256t.us link or a bare 256t
  /// string. fromUser is true when it came from the "Open" field, where a
  /// link without a 256t string deserves a message rather than silence.
  Future<void> openLink(String link, {bool fromUser = false}) async {
    final cid = cidFromText(link);
    if (cid == null) {
      if (fromUser) {
        showMessage("That link doesn't contain a 256t string.", error: true);
      }
      return;
    }
    if (busy || !await confirmDiscard()) {
      return;
    }
    linkField.clear();
    await openCid(cid);
  }

  Future<void> openCid(String cid) async {
    // Whatever happens below, don't leave the previous text on screen as if
    // it belonged to this link.
    setDocument(null, '');
    clearMessage();

    if (cid.isEmpty) {
      showMessage('This link has "256t=" but no 256t string after it.', error: true);
      return;
    }
    if (!isValid256t(cid)) {
      final shown = cid.length > 100 ? '${cid.substring(0, 100)}…' : cid;
      showMessage('"$shown" isn\'t a valid 256t string. Check that the link was copied completely.', error: true);
      return;
    }

    // Short texts are inside the 256t string itself.
    final inline = inlineBytes(cid);
    if (inline != null) {
      showText(cid, inline);
      return;
    }

    setBusy(true);
    showMessage('Loading…');
    try {
      final http.Response response;
      try {
        response = await http.get(Uri.parse('$contentUrl/$cid'));
      } catch (_) {
        showMessage("Couldn't reach HashBin to load this text. Check your connection and try again.", error: true);
        return;
      }

      switch (response.statusCode) {
        case 200:
          showText(cid, response.bodyBytes);
        case 404:
          showMessage('Nothing is stored under this 256t string. It may have expired or been deleted, or it was never saved.', error: true);
        case 451:
          showMessage('This text is unavailable while a dispute about it is reviewed.', error: true);
        // Each stored text has a download allowance; when it runs out, 256t.us answers 429.
        case 429:
          showMessage('HashBin is limiting how often this text can be downloaded. Try again later.', error: true);
        default:
          showMessage("HashBin couldn't return this text (HTTP ${response.statusCode}). Try again later.", error: true);
      }
    } finally {
      setBusy(false);
    }
  }

  void showText(String cid, List<int> bytes) {
    try {
      setDocument(cid, decodeText(bytes));
      clearMessage();
    } on FormatException {
      showMessage("This 256t string points to content that isn't text, so Textpad can't open it.", error: true);
    }
  }

  // --------------------------------------------------------------------
  // 4. The user's HashBin account
  // --------------------------------------------------------------------

  Future<void> showAccount() async {
    setState(() {
      connected = account.isConnected;
      accountLabel = connected ? 'Connected to HashBin' : 'Not connected to HashBin';
    });
    if (!connected) return;
    try {
      final response = await account.send('GET', '/api/balance');
      if (response.statusCode == 200) {
        final balanceCents = jsonDecode(utf8.decode(response.bodyBytes))['balance_cents'] as num;
        setState(() => accountLabel = 'HashBin balance: \$${(balanceCents / 100).toStringAsFixed(2)}');
      }
    } on NotConnectedException {
      showAccount();
    } catch (_) {
      // Offline: keep showing "Connected to HashBin".
    }
  }

  Future<void> disconnect() async {
    await account.disconnect();
    showAccount();
  }

  // --------------------------------------------------------------------
  // 5. Saving text
  // --------------------------------------------------------------------

  Future<void> save() async {
    if (busy || !hasUnsavedChanges || editor.text.isEmpty) {
      return;
    }
    // The editor is read-only while busy, so this is what gets saved.
    final textToSave = editor.text;
    setBusy(true);
    try {
      // The first save asks the user to approve Textpad. Unlike a web page,
      // the app keeps running while the browser is open, so nothing has to
      // be stored to survive the trip.
      if (!account.isConnected) {
        showMessage('Waiting for you to approve Textpad on HashBin…');
        final outcome = await account.connect();
        showAccount();
        if (outcome == ConnectResult.denied) {
          showMessage("You didn't approve Textpad on HashBin, so nothing was saved.", error: true);
          return;
        }
        if (outcome == ConnectResult.cancelled) {
          clearMessage();
          return;
        }
      }

      showMessage('Saving…');
      // The request body is the text itself. Uploads made with an OAuth
      // app are kept for the user's default retention period (set on their
      // HashBin account page) and charged to their balance. Texts of 64
      // bytes or less are stored inside the 256t string and are free.
      final response = await account.send(
        'POST',
        '/api/content',
        headers: {'content-type': 'text/plain; charset=utf-8'},
        body: textToSave,
      );
      Map<String, dynamic> result;
      try {
        result = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      } catch (_) {
        result = {};
      }

      if (response.statusCode != 200 && response.statusCode != 201) {
        if (result['error'] == 'insufficient_balance') {
          showMessage(
            result['message'] as String? ?? 'Your HashBin balance is too low to save this.',
            error: true,
            actions: [('Add funds', () => launchUrl(Uri.parse('$hashbinUrl/deposit.html')))],
          );
        } else {
          showMessage('Saving failed: ${result['message'] ?? result['error'] ?? 'HTTP ${response.statusCode}'}', error: true);
        }
        return;
      }

      final cid = result['cid'] as String;
      setState(() {
        currentCid = cid;
        savedText = textToSave;
      });
      final expiresAt = DateTime.tryParse(result['expires_at'] as String? ?? '');
      final expires = expiresAt == null || !mounted
          ? ''
          : ' Kept until ${MaterialLocalizations.of(context).formatMediumDate(expiresAt.toLocal())}.';
      showMessage('Saved.$expires', actions: [
        ('Copy link', () => copyLink(cid)),
        ('View raw text', () => launchUrl(Uri.parse('$contentUrl/$cid'))),
      ]);
      showAccount();
    } on NotConnectedException {
      showAccount();
      showMessage('Your HashBin connection has ended. Tap Save to connect again.', error: true);
    } catch (error) {
      showMessage('Saving failed: $error', error: true);
    } finally {
      setBusy(false);
    }
  }

  /// A link to the web version of Textpad opens the text in any browser,
  /// and pasting it into this app's "Open" field works too.
  Future<void> copyLink(String cid) async {
    await Clipboard.setData(ClipboardData(text: '$hashbinUrl/docs/textpad/app#256t=$cid'));
    showMessage('Link copied. Anyone with it can read this text.');
  }

  Future<void> newDocument() async {
    if (busy || !await confirmDiscard()) {
      return;
    }
    setDocument(null, '');
    clearMessage();
  }

  // --------------------------------------------------------------------
  // 6. Wiring it together
  // --------------------------------------------------------------------

  @override
  void initState() {
    super.initState();
    // Rebuild as the user types, so the Save button and the "Unsaved
    // changes" label stay current.
    editor.addListener(() => setState(() {}));
    linkField.addListener(() => setState(() {}));
    start();
  }

  Future<void> start() async {
    await account.load();
    showAccount();
    // app_links delivers the link that launched the app, then every link
    // opened while it runs. Links without a 256t string are ignored.
    linkSubscription = AppLinks().stringLinkStream.listen(openLink);
  }

  @override
  void dispose() {
    linkSubscription?.cancel();
    editor.dispose();
    linkField.dispose();
    super.dispose();
  }

  // --------------------------------------------------------------------
  // 7. The screen
  // --------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final muted = TextStyle(color: colors.onSurfaceVariant);

    var savedState = '';
    if (currentCid != null && !hasUnsavedChanges) {
      savedState = 'Saved as 256t:${currentCid!.substring(0, 12)}…';
    } else if (currentCid != null) {
      savedState = 'Unsaved changes';
    } else if (editor.text.isNotEmpty) {
      savedState = 'Not saved yet';
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Textpad'),
        actions: [
          if (connected) TextButton(onPressed: busy ? null : disconnect, child: const Text('Disconnect')),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(accountLabel, style: muted),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: linkField,
                      decoration: const InputDecoration(
                        hintText: 'Paste a 256t string or link',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      autocorrect: false,
                      textInputAction: TextInputAction.go,
                      onSubmitted: (text) => openLink(text, fromUser: true),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.tonal(
                    onPressed: busy || linkField.text.trim().isEmpty
                        ? null
                        : () => openLink(linkField.text, fromUser: true),
                    child: const Text('Open'),
                  ),
                ],
              ),
              if (message != null) ...[
                const SizedBox(height: 8),
                Semantics(
                  liveRegion: true,
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: message!.error ? colors.errorContainer : colors.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(message!.text),
                        if (message!.actions.isNotEmpty)
                          Wrap(
                            spacing: 8,
                            children: [
                              for (final (label, onPressed) in message!.actions)
                                TextButton(onPressed: onPressed, child: Text(label)),
                            ],
                          ),
                      ],
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Expanded(
                child: TextField(
                  controller: editor,
                  readOnly: busy,
                  maxLines: null,
                  expands: true,
                  textAlignVertical: TextAlignVertical.top,
                  keyboardType: TextInputType.multiline,
                  style: const TextStyle(fontFamily: 'monospace', fontFamilyFallback: ['Menlo', 'Courier']),
                  decoration: const InputDecoration(
                    hintText: 'Type or paste text here.',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    Expanded(child: Text(savedState, style: muted, overflow: TextOverflow.ellipsis)),
                    OutlinedButton(onPressed: busy ? null : newDocument, child: const Text('New')),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: busy || !hasUnsavedChanges || editor.text.isEmpty ? null : save,
                      child: const Text('Save'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
