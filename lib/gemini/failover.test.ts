import { describe, expect, it, vi } from "vitest";
import { runWithFailover } from "./failover";

const busy = () => Object.assign(new Error("busy"), { status: 503 });
const denied = () => Object.assign(new Error("denied"), { status: 403 });

function opts(call: (model: string, timeoutMs: number) => Promise<string>) {
  let clock = 0;
  return {
    models: ["main", "backup"],
    maxAttempts: 4,
    budgetMs: 40_000,
    minAttemptMs: 6_000,
    maxAttemptMs: 25_000,
    call,
    sleep: async (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    random: () => 1,
  };
}

describe("runWithFailover", () => {
  it("returns immediately when the first call works", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    await expect(runWithFailover(opts(call))).resolves.toEqual({
      value: "ok",
      model: "main",
    });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("survives a 503 by moving to the fallback model", async () => {
    const call = vi.fn().mockRejectedValueOnce(busy()).mockResolvedValueOnce("ok");
    await expect(runWithFailover(opts(call))).resolves.toEqual({
      value: "ok",
      model: "backup",
    });
  });

  it("gives up after maxAttempts and throws the last error", async () => {
    const call = vi.fn().mockRejectedValue(busy());
    await expect(runWithFailover(opts(call))).rejects.toMatchObject({ status: 503 });
    expect(call).toHaveBeenCalledTimes(4);
  });

  it("stops at once on a permanent error from the primary", async () => {
    const call = vi.fn().mockRejectedValue(denied());
    await expect(runWithFailover(opts(call))).rejects.toMatchObject({ status: 403 });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("drops a broken fallback and keeps using the primary", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(busy()) // main
      .mockRejectedValueOnce(Object.assign(new Error("no such model"), { status: 404 })) // backup
      .mockResolvedValueOnce("ok"); // main again
    await expect(runWithFailover(opts(call))).resolves.toEqual({
      value: "ok",
      model: "main",
    });
  });

  it("respects the time budget", async () => {
    let clock = 0;
    const call = vi.fn(async () => {
      clock += 36_000;
      throw busy();
    });
    await expect(
      runWithFailover({
        ...opts(call),
        sleep: async (ms) => {
          clock += ms;
        },
        now: () => clock,
      }),
    ).rejects.toBeDefined();
    expect(call).toHaveBeenCalledTimes(1);
  });
});
