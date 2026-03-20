/**
 * pngMetadata.ts — PNG iTXt chunk read/write utilities
 *
 * Allows embedding arbitrary UTF-8 text into PNG files using iTXt chunks.
 * Used by Nano Banana Studio to embed CharacterDNA JSON into generated PNGs.
 *
 * iTXt chunk format (uncompressed):
 *   keyword\0  — null-terminated keyword string
 *   0x00       — compression flag (0 = not compressed)
 *   0x00       — compression method
 *   \0         — language tag (empty, null-terminated)
 *   \0         — translated keyword (empty, null-terminated)
 *   text       — UTF-8 encoded text data
 */

// ─── CRC32 ────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (const b of data) {
    crc = CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── PNG signature ─────────────────────────────────────────────────────────────

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function verifySignature(view: DataView): void {
  for (let i = 0; i < 8; i++) {
    if (view.getUint8(i) !== PNG_SIGNATURE[i]) {
      throw new Error('Not a valid PNG file');
    }
  }
}

// ─── Read PNG metadata ─────────────────────────────────────────────────────────

/**
 * Parse all tEXt and iTXt metadata chunks from a PNG buffer.
 * Returns a map of keyword → text value.
 * On any parse error, returns an empty object (fail-safe).
 */
export function readPngMetadata(buffer: ArrayBuffer): Record<string, string> {
  try {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    verifySignature(view);

    const result: Record<string, string> = {};
    const dec = new TextDecoder('utf-8');
    let offset = 8; // skip PNG signature

    while (offset < buffer.byteLength - 12) {
      const length = view.getUint32(offset, false);       // big-endian
      const type = dec.decode(bytes.slice(offset + 4, offset + 8));
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      const chunkData = bytes.slice(dataStart, dataEnd);

      if (type === 'IEND') break;

      if (type === 'tEXt') {
        // keyword\0value  (Latin-1)
        const nullIdx = chunkData.indexOf(0);
        if (nullIdx !== -1) {
          const keyword = dec.decode(chunkData.slice(0, nullIdx));
          const value   = dec.decode(chunkData.slice(nullIdx + 1));
          result[keyword] = value;
        }
      } else if (type === 'iTXt') {
        // keyword\0 + compressionFlag(1) + compressionMethod(1) + languageTag\0 + translatedKeyword\0 + text
        const nullIdx = chunkData.indexOf(0);
        if (nullIdx !== -1) {
          const keyword = dec.decode(chunkData.slice(0, nullIdx));
          // Skip: null, compressionFlag, compressionMethod
          let textStart = nullIdx + 3;
          // Skip language tag (null-terminated)
          while (textStart < chunkData.length && chunkData[textStart] !== 0) textStart++;
          textStart++; // skip null
          // Skip translated keyword (null-terminated)
          while (textStart < chunkData.length && chunkData[textStart] !== 0) textStart++;
          textStart++; // skip null
          const text = dec.decode(chunkData.slice(textStart));
          result[keyword] = text;
        }
      }

      offset = dataEnd + 4; // +4 to skip CRC
    }

    return result;
  } catch {
    return {};
  }
}

// ─── Inject PNG iTXt chunk ─────────────────────────────────────────────────────

/**
 * Insert an iTXt chunk into a PNG buffer, placed just before the IEND chunk.
 * Returns a new ArrayBuffer — the original is not mutated.
 * Throws if the buffer is not a valid PNG.
 */
export function injectPngITXt(buffer: ArrayBuffer, keyword: string, text: string): ArrayBuffer {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  verifySignature(view);

  const enc = new TextEncoder();

  // Find IEND chunk offset
  let iendOffset = -1;
  let offset = 8;
  while (offset < buffer.byteLength - 12) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(
      bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
    );
    if (type === 'IEND') {
      iendOffset = offset;
      break;
    }
    offset += 8 + length + 4; // length + type + data + CRC
  }

  if (iendOffset === -1) {
    throw new Error('PNG has no IEND chunk');
  }

  // Build iTXt chunk data:
  // keyword\0 + \0 (compression flag) + \0 (compression method) + \0 (lang tag) + \0 (translated kw) + text
  const keywordBytes = enc.encode(keyword);
  const textBytes    = enc.encode(text);
  const payload = new Uint8Array(keywordBytes.length + 1 + 1 + 1 + 1 + 1 + textBytes.length);
  let pos = 0;
  payload.set(keywordBytes, pos); pos += keywordBytes.length;
  payload[pos++] = 0; // null terminator for keyword
  payload[pos++] = 0; // compression flag: uncompressed
  payload[pos++] = 0; // compression method
  payload[pos++] = 0; // language tag (empty, null-terminated)
  payload[pos++] = 0; // translated keyword (empty, null-terminated)
  payload.set(textBytes, pos);

  // Build the full chunk: [length BE][type][payload][CRC]
  const typeBytes = enc.encode('iTXt');
  const crcInput = new Uint8Array(4 + payload.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(payload, 4);
  const checksum = crc32(crcInput);

  const chunkLength = payload.length;
  const chunk = new Uint8Array(4 + 4 + chunkLength + 4);
  const chunkView = new DataView(chunk.buffer);
  chunkView.setUint32(0, chunkLength, false);  // length (big-endian)
  chunk.set(typeBytes, 4);                      // type "iTXt"
  chunk.set(payload, 8);                        // data
  chunkView.setUint32(8 + chunkLength, checksum, false); // CRC

  // Assemble: [everything before IEND] + [new chunk] + [IEND chunk]
  const before = bytes.slice(0, iendOffset);
  const iendChunk = bytes.slice(iendOffset); // from IEND to end

  const result = new Uint8Array(before.length + chunk.length + iendChunk.length);
  result.set(before, 0);
  result.set(chunk, before.length);
  result.set(iendChunk, before.length + chunk.length);

  return result.buffer;
}
