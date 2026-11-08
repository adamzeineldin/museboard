import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResumeKind } from "./constants";

// Where uploaded resume files live. Resume.storageKey is a relative key such as
// "resumes/<userId>/<random>.pdf". LocalDiskStorage maps keys under ./storage (gitignored);
// a cloud object store can implement the same interface later.

export interface FileStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Removing a missing key is not an error. */
  delete(key: string): Promise<void>;
}

export const STORAGE_DIR_ENV = "INROAD_STORAGE_DIR";
const KEY_PATTERN = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)*$/;

export class LocalDiskStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    const resolved = path.resolve(this.root, key);
    const inside = resolved.startsWith(`${this.root}${path.sep}`);
    if (!KEY_PATTERN.test(key) || key.split("/").some((part) => part === ".." || part === ".") || !inside) {
      throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
    }
    return resolved;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

export function getResumeStorage(env: Readonly<Record<string, string | undefined>> = process.env): FileStorage {
  const root = env[STORAGE_DIR_ENV]?.trim() || path.join(process.cwd(), "storage");
  return new LocalDiskStorage(root);
}

export function newResumeStorageKey(userId: string, kind: ResumeKind): string {
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error("Invalid user id for a storage key");
  return `resumes/${userId}/${randomBytes(16).toString("hex")}.${kind}`;
}
