-- Migration: Add parent_key column to students table
-- Filename: 002_add_parent_key_to_students.sql
-- Created: 2025-10-12

-- Add parent_key column to students table
ALTER TABLE students 
ADD COLUMN parent_key VARCHAR(15) UNIQUE NULL COMMENT 'Unique key for parent connection (YYYY-MMDD-XXXX format)';

-- Create index for efficient querying
CREATE INDEX idx_students_parent_key ON students(parent_key);

-- Add constraint to ensure parent_key format if provided
ALTER TABLE students 
ADD CONSTRAINT chk_parent_key_format 
CHECK (parent_key IS NULL OR parent_key REGEXP '^[0-9]{4}-[0-9]{4}-[A-Z0-9]{4}$');