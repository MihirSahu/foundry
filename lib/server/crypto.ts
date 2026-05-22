import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const version = "v1";

export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    version,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(encrypted: string) {
  const [storedVersion, ivValue, authTagValue, ciphertextValue] = encrypted.split(":");

  if (
    storedVersion !== version ||
    !ivValue ||
    !authTagValue ||
    !ciphertextValue
  ) {
    throw new Error("Invalid encrypted secret format.");
  }

  const decipher = createDecipheriv(
    algorithm,
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function getEncryptionKey() {
  const configured = process.env.TOKEN_ENCRYPTION_KEY;

  if (!configured) {
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      return createHash("sha256").update("foundry-local-development-token-key").digest();
    }

    throw new Error("TOKEN_ENCRYPTION_KEY is required.");
  }

  const decoded = decodeConfiguredKey(configured);

  if (decoded.byteLength === 32) {
    return decoded;
  }

  return createHash("sha256").update(configured).digest();
}

function decodeConfiguredKey(value: string) {
  if (/^[0-9a-f]{64}$/i.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    const decoded = Buffer.from(value, "base64");

    if (decoded.byteLength > 0) {
      return decoded;
    }
  } catch {
    // Fall through to utf8 handling.
  }

  return Buffer.from(value, "utf8");
}
