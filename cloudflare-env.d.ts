declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BACKUP_ENCRYPTION_KEY?: string;
    VAPID_PRIVATE_JWK?: string;
    VAPID_SUBJECT?: string;
    VNPAY_TMN_CODE?: string;
    VNPAY_HASH_SECRET?: string;
    AV_SCAN_URL?: string;
    AV_SCAN_TOKEN?: string;
    JUDGE0_URL?: string;
    JUDGE0_TOKEN?: string;
    BOOTSTRAP_ADMIN_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
