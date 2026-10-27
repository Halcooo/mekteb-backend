ALTER TABLE student_comments
  ADD COLUMN client_message_id CHAR(36) NULL,
  ADD COLUMN request_hash CHAR(64) NULL,
  ADD COLUMN deleted_at DATETIME(3) NULL,
  ADD COLUMN edited_at DATETIME(3) NULL,
  ADD UNIQUE KEY uq_comment_client_message (author_id, client_message_id),
  ADD INDEX idx_comment_student_cursor (student_id, id);

ALTER TABLE notifications
  ADD COLUMN dedupe_key VARCHAR(100) NULL,
  ADD UNIQUE KEY uq_notification_dedupe (recipient_user_id, dedupe_key),
  ADD INDEX idx_notification_conversation_unread (recipient_user_id, student_id, is_read, comment_id);

CREATE TABLE push_subscriptions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  endpoint TEXT NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  p256dh VARCHAR(100) NOT NULL,
  auth VARCHAR(50) NOT NULL,
  vapid_public_key VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  INDEX idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_push_session FOREIGN KEY (session_id) REFERENCES auth_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE push_deliveries (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  notification_id INT NOT NULL,
  subscription_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('pending','processing','sent','cancelled','failed') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  locked_at DATETIME(3) NULL,
  lock_token CHAR(36) NULL,
  last_error VARCHAR(50) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_delivery (notification_id, subscription_id),
  INDEX idx_push_pending (status, available_at),
  CONSTRAINT fk_delivery_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  CONSTRAINT fk_delivery_subscription FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
