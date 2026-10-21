import { describe, expect, it } from "vitest";
import { retry } from "../src/index";

describe("retry", () => {
  it("tries a passing D1 error again", async () => {
    let calls = 0;
    const result = await retry(async () => {
      if (++calls < 3) throw new Error("D1_ERROR: internal error; reference = x");
      return "ok";
    }, 3, 1);
    expect([result, calls]).toEqual(["ok", 3]);
  });

  it("gives up after the last attempt, and at once on other errors", async () => {
    let calls = 0;
    await expect(retry(async () => { calls++; throw new Error("D1_ERROR: internal error"); }, 3, 1)).rejects.toThrow("internal error");
    expect(calls).toBe(3);
    calls = 0;
    await expect(retry(async () => { calls++; throw new Error("D1_ERROR: no such table: parcels"); }, 3, 1)).rejects.toThrow("no such table");
    expect(calls).toBe(1);
  });
});
