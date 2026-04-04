# ── Admin SPA Bucket ────────────────────────────────────────────
resource "aws_s3_bucket" "admin" {
  bucket = "${var.project}-admin-${var.env}"

  tags = { Name = "${var.project}-admin-${var.env}" }
}

# Allow public access for static website hosting (staging only)
resource "aws_s3_bucket_public_access_block" "admin" {
  bucket = aws_s3_bucket.admin.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_website_configuration" "admin" {
  bucket = aws_s3_bucket.admin.id

  index_document { suffix = "index.html" }
  error_document { key = "index.html" } # SPA fallback
}

resource "aws_s3_bucket_policy" "admin_public_read" {
  bucket     = aws_s3_bucket.admin.id
  depends_on = [aws_s3_bucket_public_access_block.admin]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicRead"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.admin.arn}/*"
    }]
  })
}
