import { readFileSync } from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MAX_DOCX_UNCOMPRESSED_BYTES } from "./constants";
import { extractResumeText } from "./extract";
import { assertZipWithinLimits } from "./zip-guard";

interface Entry {
  name: string;
  data: Buffer;
  /** Override the size written in the headers (a lying zip). */
  declaredSize?: number;
}

/** Build a deflate-compressed zip by hand, so tests control every header. CRCs are left 0 (not checked). */
function buildZip(entries: Entry[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const size = entry.declaredSize ?? entry.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + compressed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

const DOC_XML =
  '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Jordan Lee</w:t></w:r></w:p></w:body></w:document>';
const bomb = (bytes: number) => Buffer.alloc(bytes, "A");

describe("assertZipWithinLimits", () => {
  it("accepts the real DOCX fixture", () => {
    const bytes = new Uint8Array(readFileSync(path.join(import.meta.dirname, "__fixtures__", "resume.docx")));
    expect(() => assertZipWithinLimits(bytes, MAX_DOCX_UNCOMPRESSED_BYTES)).not.toThrow();
  });

  it("accepts a small deflated zip", () => {
    expect(() => assertZipWithinLimits(buildZip([{ name: "word/document.xml", data: Buffer.from(DOC_XML) }]), 1024)).not.toThrow();
  });

  it("rejects an entry whose declared size is over the limit", () => {
    expect(() => assertZipWithinLimits(buildZip([{ name: "word/document.xml", data: bomb(2048) }]), 1024)).toThrow("too_large");
  });

  it("rejects a zip that lies about its sizes, without inflating past the limit", () => {
    const lying = buildZip([{ name: "word/document.xml", data: bomb(64 * 1024), declaredSize: 10 }]);
    expect(() => assertZipWithinLimits(lying, 1024)).toThrow("too_large");
  });

  it("rejects when the entries together exceed the limit", () => {
    const zip = buildZip([
      { name: "a.xml", data: bomb(600) },
      { name: "b.xml", data: bomb(600) },
    ]);
    expect(() => assertZipWithinLimits(zip, 1024)).toThrow("too_large");
  });

  it("rejects bytes that are not a zip", () => {
    expect(() => assertZipWithinLimits(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), 1024)).toThrow("malformed");
  });
});

describe("extractResumeText on a DOCX zip bomb", () => {
  it("refuses a small upload that inflates past the limit, with a clear message", async () => {
    const zip = buildZip([{ name: "word/document.xml", data: bomb(MAX_DOCX_UNCOMPRESSED_BYTES + 1) }]);
    expect(zip.length).toBeLessThan(200_000);
    await expect(extractResumeText(zip, "docx")).rejects.toThrow(/too large to read once unpacked/);
  });
});
