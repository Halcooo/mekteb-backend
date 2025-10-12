-- Migration: Create parent_students junction table
-- This table links users (acting as parents) to students

CREATE TABLE parent_students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    student_id INT NOT NULL,
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    
    -- Ensure unique parent-student connection
    UNIQUE KEY unique_parent_student (user_id, student_id)
);

-- Add index for faster lookups
CREATE INDEX idx_parent_students_user_id ON parent_students(user_id);
CREATE INDEX idx_parent_students_student_id ON parent_students(student_id);