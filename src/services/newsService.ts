import pool from "../db";
import { RowDataPacket } from "mysql2";
import { generateImageUrl } from "../middleware/multerConfig";
import { keysToCamelCase, keysToSnakeCase } from "../utils/caseConverter";
import {
  formatBosnianDate,
  formatBosnianDateTime,
} from "../utils/dateFormatter";
import { NewsItem, NewsImage, PaginatedNewsResponse } from "../types/index";

// Database row interfaces (kept for internal database operations)
interface NewsRow extends RowDataPacket {
  id: number;
  title: string;
  subtitle?: string;
  text: string;
  created_by: number;
  created_at?: Date;
  author_username?: string;
  author_name?: string;
}

interface NewsImageRow extends RowDataPacket {
  id: number;
  news_id: number;
  image_path: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at?: Date;
}

export interface CreateNewsData {
  title: string;
  subtitle?: string;
  text: string;
  createdBy: number;
}

export interface UpdateNewsData {
  title?: string;
  subtitle?: string;
  text?: string;
}

export class NewsService {
  static async getAllNews(
    page: number = 1,
    limit: number = 10
  ): Promise<PaginatedNewsResponse> {
    try {
      const offset = (page - 1) * limit;

      // Get total count
      const [countResult] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) as total FROM news"
      );
      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);

      // Get paginated news
      const [rows] = await pool.query<NewsRow[]>(
        `SELECT n.*, u.username as author_username, CONCAT(u.first_name, ' ', u.last_name) as author_name 
         FROM news n 
         LEFT JOIN users u ON n.created_by = u.id 
         ORDER BY n.created_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      // Convert each news item to camelCase and add images
      const newsWithImages = await Promise.all(
        rows.map(async (newsRow) => {
          const images = await this.getNewsImages(newsRow.id);
          // Convert database row to camelCase
          const newsItem: NewsItem = keysToCamelCase<NewsItem>(newsRow);
          return {
            ...newsItem,
            images,
          };
        })
      );

      return {
        success: true,
        data: newsWithImages,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      console.error("Error fetching paginated news:", error);
      throw error;
    }
  }

  static async getAllNewsSimple(): Promise<NewsItem[]> {
    try {
      const [rows] = await pool.query<NewsRow[]>(
        `SELECT n.*, u.username as author_username, CONCAT(u.first_name, ' ', u.last_name) as author_name 
         FROM news n 
         LEFT JOIN users u ON n.created_by = u.id 
         ORDER BY n.created_at DESC`
      );

      // Convert to camelCase and add images
      const newsWithImages = await Promise.all(
        rows.map(async (newsRow) => {
          const images = await this.getNewsImages(newsRow.id);
          const newsItem: NewsItem = keysToCamelCase<NewsItem>(newsRow);
          return {
            ...newsItem,
            images,
          };
        })
      );

      return newsWithImages;
    } catch (error) {
      console.error("Error fetching all news:", error);
      throw error;
    }
  }

  static async getNewsById(id: number): Promise<NewsItem | null> {
    try {
      const [rows] = await pool.query<NewsRow[]>(
        `SELECT n.*, u.username as author_username, CONCAT(u.first_name, ' ', u.last_name) as author_name 
         FROM news n 
         LEFT JOIN users u ON n.created_by = u.id 
         WHERE n.id = ?`,
        [id]
      );

      if (rows.length === 0) return null;

      const newsRow = rows[0];
      const images = await this.getNewsImages(id);
      const newsItem: NewsItem = keysToCamelCase<NewsItem>(newsRow);

      return {
        ...newsItem,
        images,
      };
    } catch (error) {
      console.error("Error fetching news by ID:", error);
      throw error;
    }
  }

  static async createNews(newsData: CreateNewsData): Promise<NewsItem> {
    try {
      // Convert camelCase to snake_case for database
      const dbData = keysToSnakeCase(newsData) as any;

      const [result] = await pool.query(
        `INSERT INTO news (title, subtitle, text, created_by, created_at) 
         VALUES (?, ?, ?, ?, NOW())`,
        [dbData.title, dbData.subtitle || null, dbData.text, dbData.created_by]
      );

      const insertId = (result as any).insertId;
      const createdNews = await this.getNewsById(insertId);

      if (!createdNews) {
        throw new Error("Failed to retrieve created news");
      }

      return createdNews;
    } catch (error) {
      console.error("Error creating news:", error);
      throw error;
    }
  }

  static async updateNews(
    id: number,
    updateData: UpdateNewsData
  ): Promise<NewsItem | null> {
    try {
      // Convert camelCase to snake_case for database
      const dbData = keysToSnakeCase(updateData) as any;

      const fields = Object.keys(dbData)
        .map((key) => `${key} = ?`)
        .join(", ");
      const values = [...Object.values(dbData), id];

      await pool.query(`UPDATE news SET ${fields} WHERE id = ?`, values);

      return this.getNewsById(id);
    } catch (error) {
      console.error("Error updating news:", error);
      throw error;
    }
  }

  static async deleteNews(id: number): Promise<boolean> {
    try {
      // First delete associated images
      await this.deleteAllNewsImages(id);

      // Then delete the news item
      const [result] = await pool.query("DELETE FROM news WHERE id = ?", [id]);
      return (result as any).affectedRows > 0;
    } catch (error) {
      console.error("Error deleting news:", error);
      throw error;
    }
  }

  static async getNewsByAuthor(createdBy: number): Promise<NewsItem[]> {
    try {
      const [rows] = await pool.query<NewsRow[]>(
        `SELECT n.*, u.username as author_username, CONCAT(u.first_name, ' ', u.last_name) as author_name 
         FROM news n 
         LEFT JOIN users u ON n.created_by = u.id 
         WHERE n.created_by = ? 
         ORDER BY n.created_at DESC`,
        [createdBy]
      );

      // Convert to camelCase and add images
      const newsWithImages = await Promise.all(
        rows.map(async (newsRow) => {
          const images = await this.getNewsImages(newsRow.id);
          const newsItem: NewsItem = keysToCamelCase<NewsItem>(newsRow);
          return {
            ...newsItem,
            images,
          };
        })
      );

      return newsWithImages;
    } catch (error) {
      console.error("Error fetching news by author:", error);
      throw error;
    }
  }

  static async getNewsImages(newsId: number): Promise<NewsImage[]> {
    try {
      const [rows] = await pool.query<NewsImageRow[]>(
        "SELECT * FROM news_images WHERE news_id = ? ORDER BY id ASC",
        [newsId]
      );

      // Convert to camelCase and add URL
      return rows.map((imageRow) => {
        const image: NewsImage = keysToCamelCase<NewsImage>(imageRow);
        return {
          ...image,
          url: generateImageUrl(imageRow.image_path),
        };
      });
    } catch (error) {
      console.error("Error fetching news images:", error);
      throw error;
    }
  }

  static async addNewsImage(
    newsId: number,
    imagePath: string,
    originalName: string,
    fileSize: number,
    mimeType: string
  ): Promise<NewsImage> {
    try {
      const [result] = await pool.query(
        `INSERT INTO news_images (news_id, image_path, original_name, file_size, mime_type, uploaded_at) 
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [newsId, imagePath, originalName, fileSize, mimeType]
      );

      const insertId = (result as any).insertId;

      const [rows] = await pool.query<NewsImageRow[]>(
        "SELECT * FROM news_images WHERE id = ?",
        [insertId]
      );

      if (rows.length === 0) {
        throw new Error("Failed to retrieve created image");
      }

      const imageRow = rows[0];
      const image: NewsImage = keysToCamelCase<NewsImage>(imageRow);

      return {
        ...image,
        url: generateImageUrl(imageRow.image_path),
      };
    } catch (error) {
      console.error("Error adding news image:", error);
      throw error;
    }
  }

  static async deleteNewsImage(imageId: number): Promise<boolean> {
    try {
      const [result] = await pool.query(
        "DELETE FROM news_images WHERE id = ?",
        [imageId]
      );
      return (result as any).affectedRows > 0;
    } catch (error) {
      console.error("Error deleting news image:", error);
      throw error;
    }
  }

  static async deleteAllNewsImages(newsId: number): Promise<boolean> {
    try {
      const [result] = await pool.query(
        "DELETE FROM news_images WHERE news_id = ?",
        [newsId]
      );
      return (result as any).affectedRows >= 0;
    } catch (error) {
      console.error("Error deleting all news images:", error);
      throw error;
    }
  }

  static async getImageById(imageId: number): Promise<NewsImageRow | null> {
    try {
      const [rows] = await pool.query<NewsImageRow[]>(
        "SELECT * FROM news_images WHERE id = ?",
        [imageId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error("Error fetching image by ID:", error);
      throw error;
    }
  }

  static async getImageByPath(imagePath: string): Promise<NewsImageRow | null> {
    try {
      const [rows] = await pool.query<NewsImageRow[]>(
        "SELECT * FROM news_images WHERE image_path = ?",
        [imagePath]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error("Error fetching image by path:", error);
      throw error;
    }
  }
}
