// Đây là bản vendor; nguồn chuẩn: notes.avada.net/functions/src/services/private-crypto.ts
// Khi sửa, phải sửa cả hai bản.
// Canonical client-side crypto source for the viewer and /share-note.
// Keep this independent of server APIs so vendored copies run in browsers.

export type PrivateMode = 'password' | 'key';
export const PRIVATE_ENVELOPE_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;
// Upper bound on a *received* envelope's iteration count. Without it a note
// author could publish `iterations: 2**31` and freeze any viewer's tab, since
// the viewer must run the KDF before it can tell the password is wrong.
export const PBKDF2_MAX_ITERATIONS = 2_000_000;

export interface PasswordEnvelope {
  v: 1;
  mode: 'password';
  alg: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
}

export interface KeyEnvelope {
  v: 1;
  mode: 'key';
  alg: 'AES-256-GCM';
  kdf: 'none';
  iv: string;
  ct: string;
}

export type PrivateEnvelope = PasswordEnvelope | KeyEnvelope;

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
type AesKey = Awaited<ReturnType<typeof globalThis.crypto.subtle.importKey>>;

export function toBase64Url(bytes: Uint8Array): string {
  // Avoid spreading large ciphertexts onto the call stack.
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  if (typeof s !== 'string' || /[^A-Za-z0-9_-]/.test(s) || s.length % 4 === 1) {
    throw new Error('invalid_base64url');
  }
  const binary = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  // Reject nonzero unused bits so each byte sequence has one encoding.
  if (toBase64Url(bytes) !== s) throw new Error('invalid_base64url');
  return bytes;
}

export function generatePassword(): string {
  const limit = Math.floor(256 / BASE58_ALPHABET.length) * BASE58_ALPHABET.length;
  let password = '';
  while (password.length < 20) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(20 - password.length));
    for (const byte of bytes) {
      // Only complete alphabet-sized buckets give every character equal odds.
      if (byte < limit) password += BASE58_ALPHABET[byte % BASE58_ALPHABET.length];
    }
  }
  return password;
}

export function generateKey(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

async function derivePasswordKey(password: string, salt: Uint8Array, iterations: number): Promise<AesKey> {
  const material = await globalThis.crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function importAesKey(key: Uint8Array): Promise<AesKey> {
  // WebCrypto also accepts AES-128/192, but this envelope promises AES-256.
  if (key.length !== 32) throw new Error('invalid_key_length');
  return globalThis.crypto.subtle.importKey(
    'raw', new Uint8Array(key), 'AES-GCM', false, ['encrypt', 'decrypt']
  );
}

async function encrypt(plaintext: string, key: AesKey, iv: Uint8Array): Promise<string> {
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv), tagLength: 128 },
    key,
    new TextEncoder().encode(plaintext)
  );
  return toBase64Url(new Uint8Array(ciphertext));
}

async function decrypt(env: PrivateEnvelope, key: AesKey): Promise<string> {
  const iv = new Uint8Array(fromBase64Url(env.iv));
  const ciphertext = new Uint8Array(fromBase64Url(env.ct));
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 }, key, ciphertext
    );
    return new TextDecoder('utf-8').decode(plaintext);
  } catch (error) {
    // DOMException may come from another realm; preserve programming errors.
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'OperationError') {
      throw new Error('decrypt_failed');
    }
    throw error;
  }
}

export async function encryptWithPassword(plaintext: string, password: string): Promise<PasswordEnvelope> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await derivePasswordKey(password, salt, PBKDF2_ITERATIONS);
  return {
    v: PRIVATE_ENVELOPE_VERSION,
    mode: 'password',
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    ct: await encrypt(plaintext, key, iv)
  };
}

export async function decryptWithPassword(env: PasswordEnvelope, password: string): Promise<string> {
  // Re-check here too: callers may hand us an envelope that never passed
  // isValidEnvelope, and running the KDF is the expensive, freezing part.
  if (!Number.isInteger(env.iterations) || env.iterations < 100_000 || env.iterations > PBKDF2_MAX_ITERATIONS) {
    throw new Error('invalid_iterations');
  }
  const key = await derivePasswordKey(password, fromBase64Url(env.salt), env.iterations);
  return decrypt(env, key);
}

export async function encryptWithKey(plaintext: string, key: Uint8Array): Promise<KeyEnvelope> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await importAesKey(key);
  return {
    v: PRIVATE_ENVELOPE_VERSION,
    mode: 'key',
    alg: 'AES-256-GCM',
    kdf: 'none',
    iv: toBase64Url(iv),
    ct: await encrypt(plaintext, aesKey, iv)
  };
}

export async function decryptWithKey(env: KeyEnvelope, key: Uint8Array): Promise<string> {
  return decrypt(env, await importAesKey(key));
}

export function isValidEnvelope(value: unknown): value is PrivateEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const env = value as Record<string, unknown>;
  if (env.v !== PRIVATE_ENVELOPE_VERSION || env.alg !== 'AES-256-GCM') return false;

  let fields: string[];
  if (env.mode === 'password') {
    if (env.kdf !== 'PBKDF2-SHA256' || typeof env.iterations !== 'number' ||
        !Number.isInteger(env.iterations) || env.iterations < 100_000 ||
        env.iterations > PBKDF2_MAX_ITERATIONS || typeof env.salt !== 'string') return false;
    fields = ['v', 'mode', 'alg', 'kdf', 'iterations', 'salt', 'iv', 'ct'];
  } else if (env.mode === 'key') {
    if (env.kdf !== 'none' || 'salt' in env || 'iterations' in env) return false;
    fields = ['v', 'mode', 'alg', 'kdf', 'iv', 'ct'];
  } else {
    return false;
  }

  // Own keys also catch non-enumerable and symbol extras outside the wire schema.
  const keys = Reflect.ownKeys(env);
  if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) return false;
  if (typeof env.iv !== 'string' || typeof env.ct !== 'string') return false;
  try {
    return (env.mode !== 'password' || fromBase64Url(env.salt as string).length === 16) &&
      fromBase64Url(env.iv).length === 12 && fromBase64Url(env.ct).length >= 17;
  } catch {
    return false;
  }
}
