import { describe, expect, it } from "vitest";
import {
  cosine,
  DEFAULT_DIMENSIONS,
  fnv1a,
  getEmbedder,
  hashEmbed,
  l2Normalize,
  LocalHashingEmbedder,
} from "./embedder";

const norm = (v: number[]): number => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe("LocalHashingEmbedder", () => {
  it("is deterministic across calls and instances", async () => {
    const text = "Built a distributed key-value store in Go with Raft.";
    const [a] = await new LocalHashingEmbedder().embed([text]);
    const [b] = await new LocalHashingEmbedder().embed([text]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(DEFAULT_DIMENSIONS);
  });

  it("does not depend on the other texts in the batch", async () => {
    const embedder = new LocalHashingEmbedder();
    const [alone] = await embedder.embed(["Python and React"]);
    const [, inBatch] = await embedder.embed(["Something else entirely", "Python and React"]);
    expect(inBatch).toEqual(alone);
  });

  it("returns L2-normalised vectors, and the zero vector for empty text", async () => {
    const [full, empty, stop] = await new LocalHashingEmbedder(256).embed(["TypeScript services", "", "the and of"]);
    expect(norm(full)).toBeCloseTo(1, 10);
    expect(norm(empty)).toBe(0);
    expect(norm(stop)).toBe(0);
    expect(full).toHaveLength(256);
  });

  it("gives identical texts cosine 1 and related texts more similarity than unrelated ones", () => {
    const a = hashEmbed("Backend engineer: Go, Kubernetes, distributed systems");
    const b = hashEmbed("Distributed systems engineering with Go on Kubernetes");
    const c = hashEmbed("Retail store associate for weekend shifts, cash handling");
    expect(cosine(a, a)).toBeCloseTo(1, 10);
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
  });

  it("rejects silly dimensions", () => {
    expect(() => new LocalHashingEmbedder(3)).toThrow(/dimensions/);
    expect(() => new LocalHashingEmbedder(100.5)).toThrow(/dimensions/);
  });
});

describe("cosine", () => {
  it("computes cosine for unnormalised vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([2, 0], [5, 0])).toBe(1);
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
  });

  it("is 0 when either side is the zero vector", () => {
    expect(cosine([0, 0], [1, 2])).toBe(0);
  });

  it("throws on mismatched lengths", () => {
    expect(() => cosine([1], [1, 2])).toThrow(/lengths differ/);
  });
});

describe("helpers", () => {
  it("fnv1a is stable and seed-dependent", () => {
    expect(fnv1a("go")).toBe(fnv1a("go"));
    expect(fnv1a("go")).not.toBe(fnv1a("go", 1));
    expect(fnv1a("")).toBe(0x811c9dc5);
  });

  it("l2Normalize leaves the zero vector alone and does not mutate input", () => {
    const input = [3, 4];
    expect(l2Normalize(input)).toEqual([0.6, 0.8]);
    expect(input).toEqual([3, 4]);
    expect(l2Normalize([0, 0])).toEqual([0, 0]);
  });
});

describe("getEmbedder", () => {
  it("defaults to the local embedder", () => {
    expect(getEmbedder({})).toBeInstanceOf(LocalHashingEmbedder);
    expect(getEmbedder({ INROAD_EMBEDDER: " Local " })).toBeInstanceOf(LocalHashingEmbedder);
    expect(getEmbedder({ INROAD_EMBEDDER: "" })).toBeInstanceOf(LocalHashingEmbedder);
  });

  it("explains that a hosted embedder is not wired up yet", () => {
    expect(() => getEmbedder({ INROAD_EMBEDDER: "hosted" })).toThrow(/not wired up/);
  });

  it("rejects unknown values", () => {
    expect(() => getEmbedder({ INROAD_EMBEDDER: "magic" })).toThrow(/Unknown INROAD_EMBEDDER/);
  });
});
