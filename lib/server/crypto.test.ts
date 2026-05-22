import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("token encryption", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(
      "TOKEN_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips encrypted secrets without storing plaintext", async () => {
    const { decryptSecret, encryptSecret } = await import("./crypto");
    const encrypted = encryptSecret("gho_secret-token");

    expect(encrypted).not.toContain("gho_secret-token");
    expect(decryptSecret(encrypted)).toBe("gho_secret-token");
  });

  it("fails when decrypting with a different key", async () => {
    const { decryptSecret, encryptSecret } = await import("./crypto");
    const encrypted = encryptSecret("gho_secret-token");

    vi.stubEnv(
      "TOKEN_ENCRYPTION_KEY",
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    );

    expect(() => decryptSecret(encrypted)).toThrow();
  });
});
