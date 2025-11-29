"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsService = void 0;
const db_1 = __importDefault(require("../db"));
const multerConfig_1 = require("../middleware/multerConfig");
const caseConverter_1 = require("../utils/caseConverter");
class NewsService {
    static async getAllNews(page = 1, limit = 10) {
        try {
            const offset = (page - 1) * limit;
            // Get total count
            const [countResult] = await db_1.default.query("SELECT COUNT(*) as total FROM news");
            const total = countResult[0].total;
            const totalPages = Math.ceil(total / limit);
            // Get paginated news
            const [rows] = await db_1.default.query(`SELECT n.*, u.username as author_username, CONCAT(u.first_name, ' ', u.last_name) as author_name 
         FROM news n 
         LEFT JOIN users u ON n.created_by = u.id 
         ORDER BY n.created_at DESC
         LIMIT ? OFFSET ?`, [limit, offset]);
            // Convert each news item to camelCase and add images
            const newsWithImages = await Promise.all(rows.map(async (newsRow) => {
                const images = await this.getNewsImages(newsRow.id);
                // Convert database row to camelCase
                const newsItem = (0, caseConverter_1.keysToCamelCase)(newsRow);
                return {
                    ...newsItem,
                    images,
                };
            }));
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
        }
        catch (error) {
            console.error("Error fetching paginated news:", error);
            throw error;
        }
    }
    static async getAllNewsSimple() {
        try {
            const [rows] = await db_1.default.query(`SELECT n.*, u.username as author_username, CONCAT(u.first_name, ' ', u.last_name) as author_name 
         FROM news n 
         LEFT JOIN users u ON n.created_by = u.id 
         ORDER BY n.created_at DESC`);
            // Convert to camelCase and add images
            const newsWithImages = await Promise.all(rows.map(async (newsRow) => {
                const images = await this.getNewsImages(newsRow.id);
                const newsItem = (0, caseConverter_1.keysToCamelCase)(newsRow);
                return {
                    ...newsItem,
                    images,
                };
            }));
            return newsWithImages;
        }
        catch (error) {
            console.error("Error fetching all news:", error);
            throw error;
        }
    }
    static async getNewsById(id) {
        try {
            const [rows] = await db_1.default.query(`SELECT n.*, u.username as author_username, CONCAT(u.first_name, ' ', u.last_name) as author_name 
         FROM news n 
         LEFT JOIN users u ON n.created_by = u.id 
         WHERE n.id = ?`, [id]);
            if (rows.length === 0)
                return null;
            const newsRow = rows[0];
            const images = await this.getNewsImages(id);
            const newsItem = (0, caseConverter_1.keysToCamelCase)(newsRow);
            return {
                ...newsItem,
                images,
            };
        }
        catch (error) {
            console.error("Error fetching news by ID:", error);
            throw error;
        }
    }
    static async createNews(newsData) {
        try {
            // Convert camelCase to snake_case for database
            const dbData = (0, caseConverter_1.keysToSnakeCase)(newsData);
            const [result] = await db_1.default.query(`INSERT INTO news (title, subtitle, text, created_by, created_at) 
         VALUES (?, ?, ?, ?, NOW())`, [dbData.title, dbData.subtitle || null, dbData.text, dbData.created_by]);
            const insertId = result.insertId;
            const createdNews = await this.getNewsById(insertId);
            if (!createdNews) {
                throw new Error("Failed to retrieve created news");
            }
            return createdNews;
        }
        catch (error) {
            console.error("Error creating news:", error);
            throw error;
        }
    }
    static async updateNews(id, updateData) {
        try {
            // Convert camelCase to snake_case for database
            const dbData = (0, caseConverter_1.keysToSnakeCase)(updateData);
            const fields = Object.keys(dbData)
                .map((key) => `${key} = ?`)
                .join(", ");
            const values = [...Object.values(dbData), id];
            await db_1.default.query(`UPDATE news SET ${fields} WHERE id = ?`, values);
            return this.getNewsById(id);
        }
        catch (error) {
            console.error("Error updating news:", error);
            throw error;
        }
    }
    static async deleteNews(id) {
        try {
            // First delete associated images
            await this.deleteAllNewsImages(id);
            // Then delete the news item
            const [result] = await db_1.default.query("DELETE FROM news WHERE id = ?", [id]);
            return result.affectedRows > 0;
        }
        catch (error) {
            console.error("Error deleting news:", error);
            throw error;
        }
    }
    static async getNewsByAuthor(createdBy) {
        try {
            const [rows] = await db_1.default.query(`SELECT n.*, u.username as author_username, CONCAT(u.first_name, ' ', u.last_name) as author_name 
         FROM news n 
         LEFT JOIN users u ON n.created_by = u.id 
         WHERE n.created_by = ? 
         ORDER BY n.created_at DESC`, [createdBy]);
            // Convert to camelCase and add images
            const newsWithImages = await Promise.all(rows.map(async (newsRow) => {
                const images = await this.getNewsImages(newsRow.id);
                const newsItem = (0, caseConverter_1.keysToCamelCase)(newsRow);
                return {
                    ...newsItem,
                    images,
                };
            }));
            return newsWithImages;
        }
        catch (error) {
            console.error("Error fetching news by author:", error);
            throw error;
        }
    }
    static async getNewsImages(newsId) {
        try {
            const [rows] = await db_1.default.query("SELECT * FROM news_images WHERE news_id = ? ORDER BY id ASC", [newsId]);
            // Convert to camelCase and add URL
            return rows.map((imageRow) => {
                const image = (0, caseConverter_1.keysToCamelCase)(imageRow);
                return {
                    ...image,
                    url: (0, multerConfig_1.generateImageUrl)(imageRow.image_path),
                };
            });
        }
        catch (error) {
            console.error("Error fetching news images:", error);
            throw error;
        }
    }
    static async addNewsImage(newsId, imagePath, originalName, fileSize, mimeType) {
        try {
            const [result] = await db_1.default.query(`INSERT INTO news_images (news_id, image_path, original_name, file_size, mime_type, uploaded_at) 
         VALUES (?, ?, ?, ?, ?, NOW())`, [newsId, imagePath, originalName, fileSize, mimeType]);
            const insertId = result.insertId;
            const [rows] = await db_1.default.query("SELECT * FROM news_images WHERE id = ?", [insertId]);
            if (rows.length === 0) {
                throw new Error("Failed to retrieve created image");
            }
            const imageRow = rows[0];
            const image = (0, caseConverter_1.keysToCamelCase)(imageRow);
            return {
                ...image,
                url: (0, multerConfig_1.generateImageUrl)(imageRow.image_path),
            };
        }
        catch (error) {
            console.error("Error adding news image:", error);
            throw error;
        }
    }
    static async deleteNewsImage(imageId) {
        try {
            const [result] = await db_1.default.query("DELETE FROM news_images WHERE id = ?", [imageId]);
            return result.affectedRows > 0;
        }
        catch (error) {
            console.error("Error deleting news image:", error);
            throw error;
        }
    }
    static async deleteAllNewsImages(newsId) {
        try {
            const [result] = await db_1.default.query("DELETE FROM news_images WHERE news_id = ?", [newsId]);
            return result.affectedRows >= 0;
        }
        catch (error) {
            console.error("Error deleting all news images:", error);
            throw error;
        }
    }
    static async getImageById(imageId) {
        try {
            const [rows] = await db_1.default.query("SELECT * FROM news_images WHERE id = ?", [imageId]);
            return rows.length > 0 ? rows[0] : null;
        }
        catch (error) {
            console.error("Error fetching image by ID:", error);
            throw error;
        }
    }
    static async getImageByPath(imagePath) {
        try {
            const [rows] = await db_1.default.query("SELECT * FROM news_images WHERE image_path = ?", [imagePath]);
            return rows.length > 0 ? rows[0] : null;
        }
        catch (error) {
            console.error("Error fetching image by path:", error);
            throw error;
        }
    }
}
exports.NewsService = NewsService;
