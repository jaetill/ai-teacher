import { describe, it, expect } from "vitest";
import { parseAiJson } from "../../src/lib/parse-ai-json";

// #612: one robust parser for every AI-JSON site. These cases mirror the real
// failure modes: markdown fences, stray prose, arrays vs objects, and garbage.

describe("parseAiJson", () => {
  it("parses bare JSON objects and arrays", () => {
    expect(parseAiJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseAiJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("strips markdown fences around an object", () => {
    expect(parseAiJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips fences and prose around an array", () => {
    expect(parseAiJson('Here are the mappings:\n```json\n[{"x":1}]\n```\nDone!')).toEqual([
      { x: 1 },
    ]);
  });

  it("picks the outermost value when the first bracket is an array", () => {
    // An array whose elements are objects: must slice [ .. ], not { .. }.
    expect(parseAiJson('noise [{"a":{"b":2}}] trailing')).toEqual([{ a: { b: 2 } }]);
  });

  it("handles an object containing arrays", () => {
    expect(parseAiJson('```\n{"units":[{"t":"x"}]}\n```')).toEqual({
      units: [{ t: "x" }],
    });
  });

  it("returns null on garbage", () => {
    expect(parseAiJson("I could not produce JSON, sorry.")).toBeNull();
    expect(parseAiJson("{broken")).toBeNull();
    expect(parseAiJson("")).toBeNull();
  });
});
