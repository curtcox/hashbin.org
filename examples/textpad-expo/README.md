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
