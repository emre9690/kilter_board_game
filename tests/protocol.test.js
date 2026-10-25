import test from 'node:test';
import assert from 'node:assert/strict';
import { checksum, encodeHold, encodeMessage, chunk, apiLevelFromName } from '../src/js/protocol.js';

test('checksum is the inverted byte sum', () => {
  assert.equal(checksum([]), 0xff);
  assert.equal(checksum([84]), ~84 & 0xff);
  assert.equal(checksum([200, 100]), ~(300 & 0xff) & 0xff);
});

test('v3 hold encoding packs position little-endian and RRRGGGBB', () => {
  assert.deepEqual(encodeHold(3, 0x1a3, [255, 0, 0]), [0xa3, 0x01, 0b11100000]);
  assert.deepEqual(encodeHold(3, 5, [0, 255, 0]), [5, 0, 0b00011100]);
  assert.deepEqual(encodeHold(3, 5, [0, 0, 255]), [5, 0, 0b00000011]);
});

test('v2 hold encoding packs RRGGBB then the top two position bits', () => {
  assert.deepEqual(encodeHold(2, 0x2ff, [255, 255, 255]), [0xff, 0b11111110]);
  assert.deepEqual(encodeHold(2, 3, [0, 0, 255]), [3, 0b00001100]);
});

test('single packet message is framed with T, length and checksum', () => {
  const msg = [...encodeMessage([[1, [255, 0, 0]]], 3)];
  const data = [84, 1, 0, 0b11100000];
  assert.deepEqual(msg, [1, data.length, checksum(data), 2, ...data, 3]);
});

test('empty message clears the board with a bare command packet', () => {
  assert.deepEqual([...encodeMessage([], 3)], [1, 1, checksum([84]), 2, 84, 3]);
  assert.deepEqual([...encodeMessage([], 2)], [1, 1, checksum([80]), 2, 80, 3]);
});

// Decode packets the way the board does, to check multi-packet framing.
function decodePackets(bytes) {
  const packets = [];
  let i = 0;
  while (i < bytes.length) {
    assert.equal(bytes[i], 1);
    const len = bytes[i + 1];
    const data = bytes.slice(i + 4, i + 4 + len);
    assert.equal(bytes[i + 2], checksum(data));
    assert.equal(bytes[i + 3], 2);
    assert.equal(bytes[i + 4 + len], 3);
    packets.push(data);
    i += len + 5;
  }
  return packets;
}

test('large messages split into R / Q / S packets under 255 data bytes', () => {
  const holds = Array.from({ length: 200 }, (_, p) => [p, [0, 0, 255]]);
  const packets = decodePackets([...encodeMessage(holds, 3)]);
  assert.deepEqual(packets.map((p) => p[0]), [82, 81, 83]);
  assert.ok(packets.every((p) => p.length <= 255));
  assert.equal(packets.reduce((n, p) => n + (p.length - 1) / 3, 0), 200);
});

test('chunks are at most 20 bytes and reassemble exactly', () => {
  const bytes = encodeMessage(Array.from({ length: 30 }, (_, p) => [p, [1, 2, 3]]), 3);
  const pieces = chunk(bytes);
  assert.ok(pieces.every((c) => c.length <= 20));
  assert.deepEqual(Uint8Array.from(pieces.flatMap((c) => [...c])), bytes);
});

test('API level comes from the @ suffix of the board name', () => {
  assert.equal(apiLevelFromName('Kilter Board#12345@3'), 3);
  assert.equal(apiLevelFromName('mykilterboard@2'), 2);
  assert.equal(apiLevelFromName('mykilterboard#83727'), 2);
  assert.equal(apiLevelFromName(undefined), 2);
});
