-- Migration: Create notifications table for comment interaction alerts

CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recipient_user_id INT NOT NULL,
    actor_user_id INT NULL,
    type ENUM('COMMENT_ADDED', 'COMMENT_REPLIED') NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    student_id INT NULL,
    comment_id INT NULL,
    comment_date DATE NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
    FOREIGN KEY (comment_id) REFERENCES student_comments(id) ON DELETE SET NULL,

    INDEX idx_notifications_recipient (recipient_user_id),
    INDEX idx_notifications_unread (recipient_user_id, is_read),
    INDEX idx_notifications_created_at (created_at),
    INDEX idx_notifications_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;