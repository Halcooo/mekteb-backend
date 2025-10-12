-- Rollback: Remove parent_key column from students table
-- Filename: 002_add_parent_key_to_students.rollback.sql

-- Drop the constraint first
ALTER TABLE students DROP CONSTRAINT chk_parent_key_format;

-- Drop the index
DROP INDEX idx_students_parent_key ON students;

-- Remove the parent_key column
ALTER TABLE students DROP COLUMN parent_key;