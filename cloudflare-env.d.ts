declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    VAPID_PRIVATE_JWK?: string;
    VAPID_SUBJECT?: string;
    VNPAY_TMN_CODE?: string;
    VNPAY_HASH_SECRET?: string;
    JUDGE0_URL?: string;
    JUDGE0_TOKEN?: string;
    BOOTSTRAP_ADMIN_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
