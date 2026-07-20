import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const MINIMUM_PASSWORD_LENGTH = 12;

const KEY_LENGTH = 64;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const MAX_MEMORY = 32 * 1024 * 1024;

export async function hashPassword(password: string) {
  assertValidPassword(password);
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string) {
  try {
    const [algorithm, rawN, rawR, rawP, rawSalt, rawHash] =
      encodedHash.split("$");
    const N = Number(rawN);
    const r = Number(rawR);
    const p = Number(rawP);

    if (
      algorithm !== "scrypt" ||
      N !== SCRYPT_N ||
      r !== SCRYPT_R ||
      p !== SCRYPT_P ||
      !rawSalt ||
      !rawHash
    ) {
      return false;
    }

    const salt = Buffer.from(rawSalt, "base64url");
    const expected = Buffer.from(rawHash, "base64url");
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) {
      return false;
    }

    const received = await deriveKey(password, salt);
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

export function assertValidPassword(password: string) {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(
      `Password must contain at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
    );
  }

  if (password.length > 1_024) {
    throw new Error("Password must contain at most 1,024 characters.");
  }
}

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAX_MEMORY },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      },
    );
  });
}
