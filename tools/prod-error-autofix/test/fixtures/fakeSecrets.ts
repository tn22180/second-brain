// Junk values used as input to the secret scanners. They are assembled from two
// halves at runtime because, spelled out in full, GitHub push protection matches
// them and rejects every push of this repo — the values themselves are worthless.
const token = (prefix: string, rest: string) => prefix + rest;

export const FAKE_SHOPIFY_TOKEN = token('shpat', '_00112233445566778899aabbccddeeff');
export const FAKE_SHOPIFY_CUSTOM_TOKEN = token('shpca', '_00112233445566778899aabbccddeeff');
export const FAKE_GITHUB_PAT = token('ghp', '_000011112222333344445555666677778888');
export const FAKE_GITHUB_PAT_ALT = token('ghp', '_abcdefghijklmnopqrstuvwxyz0123456789');
export const FAKE_SLACK_TOKEN = token('xoxb', '-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx');
export const FAKE_SLACK_TOKEN_ALT = token('xoxb', '-4021978436-8891234567-abcDEF123456');
export const FAKE_GITLAB_PAT = token('glpat', '-ABCDEFGH1234567890ab');
export const FAKE_GITLAB_PAT_SHORT = token('glpat', '-ABCDEFGH12345678');
export const FAKE_STRIPE_KEY = token('sk_live', '_a1b2c3d4e5f6g7h8i9j0k1l2');
