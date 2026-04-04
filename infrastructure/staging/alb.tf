# ── Application Load Balancer ───────────────────────────────────
resource "aws_lb" "main" {
  name               = "${var.project}-${var.env}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  idle_timeout = 300 # 5 min — allows large video uploads + ffmpeg transcode

  tags = { Name = "${var.project}-${var.env}-alb" }
}

# ── Target Group ───────────────────────────────────────────────
resource "aws_lb_target_group" "api" {
  name        = "${var.project}-${var.env}-api-v3"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  lifecycle { create_before_destroy = true }

  # Sticky sessions for Socket.IO handshake
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 3600
    enabled         = true
  }

  health_check {
    path                = "/health"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }

  # Allow time for WebSocket connections to drain during deploys
  deregistration_delay = 120

  tags = { Name = "${var.project}-${var.env}-api-tg" }
}

# ── HTTP Listener (staging — no SSL yet) ───────────────────────
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# Uncomment when you have an ACM certificate + domain
# resource "aws_lb_listener" "https" {
#   load_balancer_arn = aws_lb.main.arn
#   port              = 443
#   protocol          = "HTTPS"
#   ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
#   certificate_arn   = aws_acm_certificate.main.arn
#
#   default_action {
#     type             = "forward"
#     target_group_arn = aws_lb_target_group.api.arn
#   }
# }
