-- Durable login/device sessions. Refresh credentials are stored only as HMAC digests.
-- Deploy this migration before starting the session-aware application.
CREATE TABLE IF NOT EXISTS auth_sessions (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    user_id INT NOT NULL,
    current_refresh_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    generation INT UNSIGNED NOT NULL DEFAULT 0,
    user_agent VARCHAR(512) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_used_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expires_at TIMESTAMP(3) NOT NULL,
    revoked_at TIMESTAMP(3) NULL DEFAULT NULL,
    revoke_reason VARCHAR(32) NULL,
    CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_auth_sessions_user_active (user_id, revoked_at, expires_at),
    INDEX idx_auth_sessions_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Retain consumed digests until the parent session is removed so known replay
-- can revoke the family, while a guessed/unknown token can never revoke it.
CREATE TABLE IF NOT EXISTS auth_refresh_history (
    session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    refresh_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    generation INT UNSIGNED NOT NULL,
    consumed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (session_id, refresh_hash),
    UNIQUE KEY uq_auth_refresh_generation (session_id, generation),
    CONSTRAINT fk_auth_refresh_session FOREIGN KEY (session_id) REFERENCES auth_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
