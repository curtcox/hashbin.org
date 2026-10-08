// 256t strings, links and text decoding for Textpad.
//
// Nothing in this file uses React Native, so the same code runs in the app
// and in plain Node.js tests (see src/docs-textpad-native.test.js in the
// hashbin.org repository).

// ----------------------------------------------------------------------
// Finding a 256t string in a link
// ----------------------------------------------------------------------

// Textpad opens a 256t string from any of these:
//   - its own deep link:     org.hashbin.textpad.expo://open?256t=<cid>
//   - a web Textpad link:    https://hashbin.org/docs/textpad/app#256t=<cid>
//   - a raw content link:    https://256t.us/<cid>
//   - the bare 256t string:  <cid>
// It returns null for a link that holds no 256t string, such as the
// "org.hashbin.textpad.expo://oauth?code=…" link that ends a sign-in.
export function cidFromText(text) {
  const trimmed = text.trim();
  const param = trimmed.match(/[#?&]256t=([^&#]*)/);
  if (param) {
    try {
      return decodeURIComponent(param[1]);
    } catch {
      return param[1]; // A stray "%" can't be decoded; isValid256t rejects it.
    }
  }
  const contentLink = trimmed.match(/^https:\/\/256t\.us\/([^/?#]*)/);
  if (contentLink) {
    return contentLink[1];
  }
  return trimmed.includes("://") ? null : trimmed;
}

// The query parameters of a link, such as the "code" and "state" that
// HashBin adds when it sends the user back after sign-in. (React Native's
// URL class doesn't support searchParams, so this is done by hand.)
export function queryParams(link) {
  const query = link.split("#")[0].split("?")[1] || "";
  const params = {};
  for (const pair of query.split("&").filter(Boolean)) {
    const [name, value = ""] = pair.split("=");
    params[decodeURIComponent(name)] = decodeURIComponent(value.replace(/\+/g, " "));
  }
  return params;
}

// ----------------------------------------------------------------------
// Checking a 256t string
// ----------------------------------------------------------------------

export function base64UrlToBytes(text) {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export function bytesToBase64Url(bytes) {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// A 256t string is base64url text in two parts:
//   - 8 characters holding the content's length in bytes
//     (a 6-byte big-endian number);
//   - then the content itself if it is 64 bytes or less, or else the
//     content's SHA-512 hash (always 86 characters).
// Checking this up front gives a clear message for a mistyped or cut-off
// link instead of a confusing "not found".
export function contentLength(cid) {
  return base64UrlToBytes(cid.slice(0, 8)).reduce((total, byte) => total * 256 + byte, 0);
}

export function isValid256t(cid) {
  if (!/^[A-Za-z0-9_-]{8,94}$/.test(cid)) {
    return false;
  }
  const length = contentLength(cid);
  const expectedRest = length <= 64 ? Math.ceil((length * 4) / 3) : 86;
  return cid.length - 8 === expectedRest;
}

// Short texts are inside the 256t string itself, so there is nothing to
// download: this returns their bytes, or null for longer content.
export function inlineBytes(cid) {
  return contentLength(cid) <= 64 ? base64UrlToBytes(cid.slice(8)) : null;
}

// ----------------------------------------------------------------------
// Turning bytes into text
// ----------------------------------------------------------------------

// Content on HashBin is just bytes. Textpad only opens bytes that are valid
// UTF-8 text. React Native has no strict UTF-8 decoder, but
// decodeURIComponent is one: given the bytes as %XX escapes, it throws on
// anything that isn't valid UTF-8 instead of inserting replacement
// characters. It also keeps a leading byte order mark, so saving unchanged
// text gives back exactly the same bytes and 256t string.
export function decodeText(bytes) {
  let escaped = "";
  for (const byte of bytes) {
    escaped += byte < 16 ? `%0${byte.toString(16)}` : `%${byte.toString(16)}`;
  }
  const text = decodeURIComponent(escaped);
  // Valid UTF-8 can still be binary data; a NUL character is a reliable
  // sign of that, and real text practically never contains one.
  if (text.includes("\0")) {
    throw new TypeError("Content contains NUL characters");
  }
  return text;
}
