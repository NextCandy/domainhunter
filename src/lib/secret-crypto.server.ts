import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "aes-256-gcm:v1";

function key() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16)
    throw new Error("JWT_SECRET 未配置或长度不足，无法加密服务端密钥");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string | null | undefined) {
  if (!plain) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith(`${PREFIX}:`)) {
    try {
      return Buffer.from(value, "base64").toString("utf8");
    } catch {
      throw new Error("密钥不可用或配置错误");
    }
  }

  const [, , iv64, tag64, cipher64] = value.split(":");
  if (!iv64 || !tag64 || !cipher64) throw new Error("密钥不可用或配置错误");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv64, "base64"));
    decipher.setAuthTag(Buffer.from(tag64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(cipher64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("密钥不可用或配置错误");
  }
}

export function isAesSecret(value: string | null | undefined) {
  return !!value?.startsWith(`${PREFIX}:`);
}
