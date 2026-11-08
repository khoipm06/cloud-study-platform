declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    VAPID_PRIVATE_JWK?: string;
    VAPID_SUBJECT?: string;
    BUCKET?: R2Bucket;
  }
}
