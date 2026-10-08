// 256t strings, links and text decoding for Textpad.
//
// Nothing in this file uses Flutter, so it can be tested with plain Dart
// (see test/textpad_test.dart).

import 'dart:convert';
import 'dart:typed_data';

// ----------------------------------------------------------------------
// Finding a 256t string in a link
// ----------------------------------------------------------------------

/// Finds the 256t string in any of these:
///   - Textpad's own deep link: `org.hashbin.textpad.flutter://open?256t=<cid>`
///   - a web Textpad link:      `https://hashbin.org/docs/textpad/app#256t=<cid>`
///   - a raw content link:      `https://256t.us/<cid>`
///   - the bare 256t string:    `<cid>`
/// Returns null for a link that holds no 256t string.
String? cidFromText(String text) {
  final trimmed = text.trim();
  final param = RegExp(r'[#?&]256t=([^&#]*)').firstMatch(trimmed);
  if (param != null) {
    try {
      return Uri.decodeComponent(param[1]!);
    } on ArgumentError {
      return param[1]; // A stray "%" can't be decoded; isValid256t rejects it.
    }
  }
  final contentLink = RegExp(r'^https://256t\.us/([^/?#]*)').firstMatch(trimmed);
  if (contentLink != null) {
    return contentLink[1];
  }
  return trimmed.contains('://') ? null : trimmed;
}

// ----------------------------------------------------------------------
// Checking a 256t string
// ----------------------------------------------------------------------

Uint8List base64UrlToBytes(String text) => base64Url.decode(base64Url.normalize(text));

String bytesToBase64Url(List<int> bytes) => base64UrlEncode(bytes).replaceAll('=', '');

/// A 256t string is base64url text in two parts:
///   - 8 characters holding the content's length in bytes
///     (a 6-byte big-endian number);
///   - then the content itself if it is 64 bytes or less, or else the
///     content's SHA-512 hash (always 86 characters).
/// Checking this up front gives a clear message for a mistyped or cut-off
/// link instead of a confusing "not found".
int contentLength(String cid) =>
    base64UrlToBytes(cid.substring(0, 8)).fold(0, (total, byte) => total * 256 + byte);

bool isValid256t(String cid) {
  if (!RegExp(r'^[A-Za-z0-9_-]{8,94}$').hasMatch(cid)) {
    return false;
  }
  final length = contentLength(cid);
  final expectedRest = length <= 64 ? (length * 4 / 3).ceil() : 86;
  return cid.length - 8 == expectedRest;
}

/// Short texts are inside the 256t string itself, so there is nothing to
/// download: this returns their bytes, or null for longer content.
Uint8List? inlineBytes(String cid) =>
    contentLength(cid) <= 64 ? base64UrlToBytes(cid.substring(8)) : null;

// ----------------------------------------------------------------------
// Turning bytes into text
// ----------------------------------------------------------------------

/// Content on HashBin is just bytes. Textpad only opens bytes that are valid
/// UTF-8 text: utf8.decode throws a FormatException on anything else
/// instead of inserting replacement characters.
String decodeText(List<int> bytes) {
  // utf8.decode drops a leading byte order mark. Put it back, so saving
  // unchanged text gives back exactly the same bytes and 256t string.
  final hasBom = bytes.length >= 3 && bytes[0] == 0xef && bytes[1] == 0xbb && bytes[2] == 0xbf;
  final text = (hasBom ? '\uFEFF' : '') + utf8.decode(hasBom ? bytes.sublist(3) : bytes);
  // Valid UTF-8 can still be binary data; a NUL character is a reliable
  // sign of that, and real text practically never contains one.
  if (text.contains('\u0000')) {
    throw const FormatException('Content contains NUL characters');
  }
  return text;
}
