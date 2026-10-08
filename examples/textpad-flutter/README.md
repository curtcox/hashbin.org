# Textpad for Flutter

An iOS and Android text editor that opens text from a 256t link and saves it
to the user's HashBin account through OAuth. The walkthrough is at
https://hashbin.org/docs/textpad-flutter

```sh
flutter run     # on a simulator, emulator or connected phone
flutter test    # the unit tests
```

Against a local HashBin server (`npm run dev:local` in the repository root),
register an app there with the redirect URI
`org.hashbin.textpad.flutter://oauth`, then:

```sh
flutter run --dart-define=HASHBIN_URL=http://127.0.0.1:8787 \
            --dart-define=TEXTPAD_CLIENT_ID=<client ID>
```
