import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../../src/retry.js";
import type { RetryConfig } from "../../src/retry.js";
import pino from "pino";

// Silent logger for tests
const logger = pino({ level: "silent" });

function makeConfig(overrides?: Partial<RetryConfig>): RetryConfig {
  return {
    maxRetries: overrides?.maxRetries ?? 3,
    retryBaseMs: overrides?.retryBaseMs ?? 10, // Fast for tests
    logger: overrides?.logger ?? logger,
  };
}

describe("fetchWithRetry", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns response on 200 without retrying", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const response = await fetchWithRetry(
      "http://localhost/test",
      undefined,
      makeConfig(),
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 with Retry-After header", async () => {
    // First call: 429 with Retry-After
    fetchSpy.mockResolvedValueOnce(
      new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "1" },
      }),
    );
    // Second call: success
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const response = await fetchWithRetry(
      "http://localhost/test",
      undefined,
      makeConfig({ retryBaseMs: 1 }),
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 400", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "bad request" }), {
        status: 400,
      }),
    );

    const response = await fetchWithRetry(
      "http://localhost/test",
      undefined,
      makeConfig(),
    );

    expect(response.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 500", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "server error" }), {
        status: 500,
      }),
    );

    const response = await fetchWithRetry(
      "http://localhost/test",
      undefined,
      makeConfig(),
    );

    expect(response.status).toBe(500);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries on 429", async () => {
    // All 4 calls (1 initial + 3 retries) return 429
    for (let i = 0; i < 4; i++) {
      fetchSpy.mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "0" },
        }),
      );
    }

    const response = await fetchWithRetry(
      "http://localhost/test",
      undefined,
      makeConfig({ maxRetries: 3, retryBaseMs: 1 }),
    );

    // After exhausting retries, returns the last 429 response
    expect(response.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("retries on network error (TypeError)", async () => {
    // First call: network error
    fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));
    // Second call: success
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const response = await fetchWithRetry(
      "http://localhost/test",
      undefined,
      makeConfig({ retryBaseMs: 1 }),
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws after maxRetries on network errors", async () => {
    // All calls fail with TypeError
    for (let i = 0; i < 4; i++) {
      fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));
    }

    await expect(
      fetchWithRetry(
        "http://localhost/test",
        undefined,
        makeConfig({ maxRetries: 3, retryBaseMs: 1 }),
      ),
    ).rejects.toThrow(TypeError);

    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it("does NOT retry non-TypeError errors", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("some other error"));

    await expect(
      fetchWithRetry(
        "http://localhost/test",
        undefined,
        makeConfig(),
      ),
    ).rejects.toThrow("some other error");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
