-- Migration: Create student_comments table for daily comments and parent replies
-- Filename: 001_create_student_comments_table.sql
-- Created: 2025-10-12

CREATE TABLE IF NOT EXISTS student_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    author_id INT NOT NULL,
    author_role ENUM('admin', 'teacher', 'parent') NOT NULL DEFAULT 'admin',
    content TEXT NOT NULL,
    date DATE NOT NULL COMMENT 'The date this comment refers to (YYYY-MM-DD)',
    parent_comment_id INT NULL COMMENT 'If this is a reply, references the parent comment',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES student_comments(id) ON DELETE CASCADE,
    
    -- Indexes for better performance
    INDEX idx_student_date (student_id, date),
    INDEX idx_author (author_id),
    INDEX idx_date (date),
    INDEX idx_parent_comment (parent_comment_id),
    INDEX idx_author_role (author_role)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Student daily comments and parent replies';

-- Add some sample data constraints
ALTER TABLE student_comments 
ADD CONSTRAINT chk_content_length CHECK (CHAR_LENGTH(content) >= 1 AND CHAR_LENGTH(content) <= 2000);

-- Ensure parent comments can only be replied to by parents
-- This will be enforced in application logic, but we can add a trigger if needed

-- Add index for efficient querying of comment threads
CREATE INDEX idx_comment_thread ON student_comments (student_id, date, parent_comment_id);