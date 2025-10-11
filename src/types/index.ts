/**
 * TypeScript interfaces using camelCase for consistency
 * Database uses snake_case, but TypeScript code uses camelCase
 */

export interface NewsImage {
  id: number;
  newsId: number;
  imagePath: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt?: string;
  url?: string;
}

export interface NewsItem {
  id: number;
  title: string;
  text: string;
  subtitle?: string;
  createdBy: number;
  createdAt?: string;
  authorUsername?: string;
  images?: NewsImage[];
}

export interface PaginatedNewsResponse {
  success: boolean;
  data: NewsItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface User {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: "admin" | "teacher" | "student";
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role: "admin" | "teacher" | "student";
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Database row interfaces (snake_case) - used only for database operations
export interface NewsImageRow {
  id: number;
  news_id: number;
  image_path: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at?: string;
}

export interface NewsItemRow {
  id: number;
  title: string;
  text: string;
  subtitle?: string;
  created_by: number;
  created_at?: string;
  author_username?: string;
}

export interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  first_name?: string;
  last_name?: string;
  role: "admin" | "teacher" | "student";
  created_at?: string;
  updated_at?: string;
}
