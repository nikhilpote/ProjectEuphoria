# ── Generated Secrets ───────────────────────────────────────────
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "jwt_refresh_secret" {
  length  = 64
  special = false
}

resource "random_password" "admin_jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "answer_encryption_key" {
  length  = 64
  special = false
  upper   = false # hex-like chars only
}
