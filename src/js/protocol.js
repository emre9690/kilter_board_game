// Aurora / Kilter board LED protocol encoder.
// Reference: https://github.com/1-max-1/fake_kilter_board (README + DataDecoder.pde)
//
// Packet:  [0x01, dataLength, checksum(data), 0x02, ...data, 0x03]
// data[0]: command byte telling the board where this packet sits in the message
//          API v3: T = only, R = first, Q = middle, S = last
//          API v2: P = only, N = first, M = middle, O = last
// Holds:   v3 -> 3 bytes [posLo, posHi, RRRGGGBB]
//          v2 -> 2 bytes [posLo, RRGGBBpp]  (pp = top two position bits)

const MAX_DATA_BYTES = 255; // dataLength is a single byte
export const BLE_CHUNK_SIZE = 20;

const COMMANDS = {
  2: { only: 80, first: 78, middle: 77, last: 79 },
  3: { only: 84, first: 82, middle: 81, last: 83 },
};

export function checksum(bytes) {
  let sum = 0;
  for (const b of bytes) sum = (sum + b) & 0xff;
  return ~sum & 0xff;
}

const scale = (value, levels) => Math.round((Math.max(0, Math.min(255, value)) / 255) * levels);

export function encodeHold(apiLevel, position, [r, g, b]) {
  if (apiLevel >= 3) {
    const color = (scale(r, 7) << 5) | (scale(g, 7) << 2) | scale(b, 3);
    return [position & 0xff, (position >> 8) & 0xff, color];
  }
  const color = (scale(r, 3) << 6) | (scale(g, 3) << 4) | (scale(b, 3) << 2);
  return [position & 0xff, color | ((position >> 8) & 0b11)];
}

function wrapPacket(data) {
  return [1, data.length, checksum(data), 2, ...data, 3];
}

// holds: iterable of [position, [r, g, b]]. An empty list clears the board.
export function encodeMessage(holds, apiLevel = 3) {
  const level = apiLevel >= 3 ? 3 : 2;
  const cmd = COMMANDS[level];
  const holdBytes = level === 3 ? 3 : 2;
  const perPacket = Math.floor((MAX_DATA_BYTES - 1) / holdBytes);

  const encoded = [...holds].map(([pos, rgb]) => encodeHold(level, pos, rgb));
  const groups = [];
  for (let i = 0; i < encoded.length; i += perPacket) groups.push(encoded.slice(i, i + perPacket));
  if (groups.length === 0) groups.push([]);

  const bytes = [];
  groups.forEach((group, i) => {
    let command = cmd.middle;
    if (groups.length === 1) command = cmd.only;
    else if (i === 0) command = cmd.first;
    else if (i === groups.length - 1) command = cmd.last;
    bytes.push(...wrapPacket([command, ...group.flat()]));
  });
  return Uint8Array.from(bytes);
}

export function chunk(bytes, size = BLE_CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.slice(i, i + size));
  return chunks;
}

// Board names look like "Name#serial@apiLevel"; no "@" means API level 2.
export function apiLevelFromName(name) {
  const match = /@(\d)\s*$/.exec(name || '');
  return match ? Number(match[1]) : 2;
}
