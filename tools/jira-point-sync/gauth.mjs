// Mint Google access token từ service account (RS256 JWT → OAuth2), không cần cài lib ngoài.
// Key KHÔNG nằm trong repo — trỏ bằng env FALCON_SA_PATH, mặc định là chỗ file được đưa lần đầu.
import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

export const SA_PATH = process.env.FALCON_SA_PATH
  || '/Users/nguyentuan/Downloads/falcon-manager-firebase-adminsdk-fbsvc-9a5d4332ee (1).json';

if (!existsSync(SA_PATH)) {
  throw new Error(`MISSING_SERVICE_ACCOUNT: không thấy ${SA_PATH}\n` +
    `Đặt biến môi trường FALCON_SA_PATH trỏ tới file service account của project falcon-manager.`);
}

const sa = JSON.parse(readFileSync(SA_PATH, 'utf8'));
export const PROJECT = sa.project_id;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export async function token(scope = 'https://www.googleapis.com/auth/cloud-platform') {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claim)}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('TOKEN_FAIL ' + JSON.stringify(j));
  return j.access_token;
}
