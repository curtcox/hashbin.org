import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:textpad/textpad.dart';

/// Builds a 256t string the way HashBin does: the length as 6 bytes, then
/// the content itself (64 bytes or less) or its SHA-512 hash.
String make256t(List<int> content) {
  final length = ByteData(8)..setUint64(0, content.length);
  final prefix = bytesToBase64Url(length.buffer.asUint8List(2));
  final rest = content.length <= 64 ? content : sha512.convert(content).bytes;
  return prefix + bytesToBase64Url(rest);
}

void main() {
  group('isValid256t', () {
    test('accepts empty, inline and hashed content', () {
      for (final size in [0, 1, 2, 3, 63, 64, 65, 1000]) {
        expect(isValid256t(make256t(List.filled(size, 65))), isTrue, reason: 'size $size');
      }
    });

    test('rejects malformed, truncated and padded strings', () {
      final inline = make256t(utf8.encode('Hello from Textpad!'));
      final hashed = make256t(List.filled(500, 0));
      expect(isValid256t('not-a-real-256t-string'), isFalse);
      expect(isValid256t('abc%zz'), isFalse);
      expect(isValid256t(inline.substring(0, inline.length - 1)), isFalse);
      expect(isValid256t('${inline}A'), isFalse);
      expect(isValid256t(hashed.substring(0, hashed.length - 2)), isFalse);
      expect(isValid256t('${hashed.substring(0, 20)}+${hashed.substring(21)}'), isFalse);
    });
  });

  test('reads inline content straight from the 256t string', () {
    const text = 'Hello from Textpad! é 中 😀';
    expect(decodeText(inlineBytes(make256t(utf8.encode(text)))!), text);
    expect(inlineBytes(make256t(List.filled(65, 65))), isNull);
  });

  test('refuses content that is not text', () {
    expect(() => decodeText([0xff, 0xfe, 0x00, 0x01]), throwsFormatException);
    expect(() => decodeText(utf8.encode('binary\u0000data')), throwsFormatException);
  });

  test('keeps a byte order mark so unchanged text saves to the same bytes', () {
    final bytes = [0xef, 0xbb, 0xbf, 0x68, 0x69];
    expect(utf8.encode(decodeText(bytes)), bytes);
  });

  test('finds the 256t string in links', () {
    const cid = 'AAAAAAAFaGVsbG8';
    expect(cidFromText('org.hashbin.textpad.flutter://open?256t=$cid'), cid);
    expect(cidFromText('https://hashbin.org/docs/textpad/app#256t=$cid'), cid);
    expect(cidFromText('https://256t.us/$cid'), cid);
    expect(cidFromText('  $cid\n'), cid);
    expect(cidFromText('org.hashbin.textpad.flutter://open?256t='), '');
    expect(cidFromText('org.hashbin.textpad.flutter://open?256t=abc%zz'), 'abc%zz');
    expect(cidFromText('org.hashbin.textpad.flutter://oauth?code=x&state=y'), isNull);
  });
}
