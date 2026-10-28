# Textpad for Expo

An iOS and Android text editor, built with Expo and React Native, that opens
text from a 256t link and saves it to the user's HashBin account through
OAuth. The walkthrough is at https://hashbin.org/docs/textpad-expo

Textpad needs a development build (it can't run in Expo Go):

```sh
npm install
npx expo run:ios        # or: npx expo run:android
```

The tests for `textpad.js` and `hashbin.js` run with the rest of the
repository's unit tests (`npm run test:unit` in the repository root).

Against a local HashBin server (`npm run dev:local` in the repository root),
register an app there with the redirect URI `org.hashbin.textpad.expo://oauth`,
then:

```sh
EXPO_PUBLIC_HASHBIN_URL=http://127.0.0.1:8787 \
EXPO_PUBLIC_TEXTPAD_CLIENT_ID=<client ID> \
npx expo run:ios
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
