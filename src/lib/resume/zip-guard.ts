import { inflateRawSync } from "node:zlib";

// A DOCX is a zip. mammoth (via jszip) inflates every entry fully in memory, so a sub-MB upload of highly
// compressed text can expand to gigabytes. This guard walks the zip's central directory and inflates each
// entry with a hard output cap BEFORE mammoth sees the file, so the total unpacked size is bounded even
// when the headers lie about it. Pure: no I/O.

export type ZipGuardFailure = "malformed" | "too_large";

export class ZipGuardError extends Error {
  constructor(readonly failure: ZipGuardFailure) {
    super(failure);
    this.name = "ZipGuardError";
  }
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_SIZE = 22;
const MAX_COMMENT = 0xffff;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const ZIP64_MARKER = 0xffffffff;
const STORED = 0;
const DEFLATED = 8;
/** Real DOCX files have tens of entries. */
const MAX_ENTRIES = 2000;

interface CentralEntry {
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

const fail = (failure: ZipGuardFailure): never => {
  throw new ZipGuardError(failure);
};

function findEndOfCentralDirectory(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - EOCD_SIZE - MAX_COMMENT);
  for (let at = view.byteLength - EOCD_SIZE; at >= lowest; at -= 1) {
    if (view.getUint32(at, true) === EOCD_SIGNATURE) return at;
  }
  return fail("malformed");
}

function readCentralDirectory(view: DataView): CentralEntry[] {
  const eocd = findEndOfCentralDirectory(view);
  const count = view.getUint16(eocd + 10, true);
  const start = view.getUint32(eocd + 16, true);
  if (count > MAX_ENTRIES) fail("too_large");
  const entries: CentralEntry[] = [];
  let at = start;
  for (let index = 0; index < count; index += 1) {
    if (at + CENTRAL_HEADER_SIZE > view.byteLength || view.getUint32(at, true) !== CENTRAL_SIGNATURE) fail("malformed");
    const entry = {
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      uncompressedSize: view.getUint32(at + 24, true),
      localOffset: view.getUint32(at + 42, true),
    };
    // ZIP64 sizes only appear in files far larger than any resume.
    if (entry.compressedSize === ZIP64_MARKER || entry.uncompressedSize === ZIP64_MARKER) fail("too_large");
    entries.push(entry);
    at += CENTRAL_HEADER_SIZE + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return entries;
}

function entryData(bytes: Uint8Array, view: DataView, entry: CentralEntry): Uint8Array {
  const at = entry.localOffset;
  if (at + LOCAL_HEADER_SIZE > view.byteLength || view.getUint32(at, true) !== LOCAL_SIGNATURE) fail("malformed");
  const dataStart = at + LOCAL_HEADER_SIZE + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length) fail("malformed");
  return bytes.subarray(dataStart, dataEnd);
}

/** Actual inflated size of one entry, refusing to produce more than `budget` bytes. */
function inflatedSize(data: Uint8Array, method: number, budget: number): number {
  if (method === STORED) return data.length;
  if (method !== DEFLATED) return fail("malformed");
  try {
    return inflateRawSync(data, { maxOutputLength: Math.max(1, budget + 1) }).length;
  } catch (error) {
    if (error instanceof RangeError || (error as { code?: unknown }).code === "ERR_BUFFER_TOO_LARGE") return fail("too_large");
    return fail("malformed");
  }
}

/**
 * Throws ZipGuardError('too_large') if the zip's entries would unpack to more than `maxBytes` in total
 * (declared or actual), or ZipGuardError('malformed') if it is not a readable zip.
 */
export function assertZipWithinLimits(bytes: Uint8Array, maxBytes: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < EOCD_SIZE) fail("malformed");
  const entries = readCentralDirectory(view);
  const declared = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (declared > maxBytes) fail("too_large");
  let total = 0;
  for (const entry of entries) {
    total += inflatedSize(entryData(bytes, view, entry), entry.method, maxBytes - total);
    if (total > maxBytes) fail("too_large");
  }
}
