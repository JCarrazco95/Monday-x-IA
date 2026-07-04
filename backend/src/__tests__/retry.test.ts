import { describe, it, expect, vi } from "vitest";
import { withRetry, isTransient, is429 } from "../lib/retry.js";

function httpError(status: number, message = `HTTP ${status}`): Error {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

describe("isTransient", () => {
  it("reintentable: 429, 5xx, 529, timeouts y errores de red", () => {
    expect(isTransient(httpError(429))).toBe(true);
    expect(isTransient(httpError(503))).toBe(true);
    expect(isTransient(httpError(529))).toBe(true);
    expect(isTransient(new Error("fetch failed"))).toBe(true);
    expect(isTransient(new Error("socket hang up"))).toBe(true);
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isTransient(abort)).toBe(true);
  });

  it("detecta el 429 de Gemini aunque venga solo en el mensaje", () => {
    expect(is429(httpError(429))).toBe(true);
    expect(is429(new Error('got status: 429 . {"error":{"code":429,"message":"You exceeded your current quota"}}'))).toBe(true);
    expect(is429(new Error("RESOURCE_EXHAUSTED"))).toBe(true);
    expect(is429(httpError(500))).toBe(false);
    // y cuenta como transitorio (se reintenta)
    expect(isTransient(new Error('{"error":{"code":429}}'))).toBe(true);
  });

  it("NO reintentable: 400/401/403 y errores de lógica", () => {
    expect(isTransient(httpError(400))).toBe(false);
    expect(isTransient(httpError(401))).toBe(false);
    expect(isTransient(httpError(403))).toBe(false);
    expect(isTransient(new Error("JSON inválido"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("devuelve el resultado al primer intento sin reintentar", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, "test")).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reintenta errores transitorios y termina bien", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(httpError(429))
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, "test", { retries: 2, baseDelayMs: 1, floor429Ms: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("propaga de inmediato los errores permanentes", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(401, "unauthorized"));
    await expect(withRetry(fn, "test", { retries: 3, baseDelayMs: 1 })).rejects.toThrow("unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("lanza el último error al agotar los reintentos", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(503, "overloaded"));
    await expect(withRetry(fn, "test", { retries: 2, baseDelayMs: 1 })).rejects.toThrow("overloaded");
    expect(fn).toHaveBeenCalledTimes(3); // 1 intento + 2 reintentos
  });
});
