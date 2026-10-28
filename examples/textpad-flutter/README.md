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

## OAuth safety

This example uses raw OAuth bearer tokens in native secure storage; it does not implement
the hosted browser SDK's DPoP binding. Access tokens last 15 minutes; newly issued refresh
tokens expire after seven idle days and the family lasts at most 90 days, subject to grant
expiry. Refreshes send `client_id` and share one renewal in the running app. Reusing a rotated
token revokes the whole grant. Disconnect attempts server revocation; if it cannot reach
HashBin, revoke the app from the Account page to invalidate remote copies. For browser save
buttons, prefer [credential-free hosted approval](https://hashbin.org/docs/browser-client-safety).
Local OAuth testing also requires the throwaway signing key described in
[local development](../../docs/local-development.md#local-oauth).
