declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    VAPID_PRIVATE_JWK?: string;
    VAPID_SUBJECT?: string;
    JUDGE0_URL?: string;
    JUDGE0_TOKEN?: string;
    BUCKET?: R2Bucket;
  }
}
