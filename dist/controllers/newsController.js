"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsController = void 0;
const newsService_1 = require("../services/newsService");
const multerConfig_1 = require("../middleware/multerConfig");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const requestValidation_1 = require("../utils/requestValidation");
class NewsController {
    static async getAllNews(req, res) {
        try {
            const page = req.query.page === undefined ? 1 : (0, requestValidation_1.parsePositiveInteger)(req.query.page);
            const limit = req.query.limit === undefined ? 10 : (0, requestValidation_1.parsePositiveInteger)(req.query.limit);
            // Validate pagination parameters
            if (!page || !limit || limit > 100 || !Number.isSafeInteger((page - 1) * limit)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100",
                });
                return;
            }
            const result = await newsService_1.NewsService.getAllNews(page, limit);
            res.json(result);
        }
        catch (error) {
            console.error("Error in getAllNews controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch news",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async getNewsById(req, res) {
        try {
            const id = (0, requestValidation_1.parsePositiveInteger)(req.params.id);
            if (!id) {
                res.status(400).json({
                    success: false,
                    error: "Invalid news ID",
                });
                return;
            }
            const news = await newsService_1.NewsService.getNewsById(id);
            if (!news) {
                res.status(404).json({
                    success: false,
                    error: "News not found",
                });
                return;
            }
            res.json({
                success: true,
                data: news,
            });
        }
        catch (error) {
            console.error("Error in getNewsById controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch news",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async createNews(req, res) {
        try {
            const { title, text, subtitle } = req.body ?? {};
            // Basic validation
            if (!(0, requestValidation_1.isValidText)(title, 255) || !(0, requestValidation_1.isValidText)(text, 50000) || (subtitle !== undefined && !(0, requestValidation_1.isValidText)(subtitle, 255))) {
                res.status(400).json({
                    success: false,
                    error: "Title and text are required",
                });
                return;
            }
            // Get user ID from JWT token (set by authenticateToken middleware)
            const created_by = req.user.userId;
            const newNews = await newsService_1.NewsService.createNews({
                title,
                text,
                createdBy: created_by,
                subtitle,
            });
            res.status(201).json({
                success: true,
                message: "News created successfully",
                data: newNews,
            });
        }
        catch (error) {
            console.error("Error in createNews controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create news",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async updateNews(req, res) {
        try {
            const id = (0, requestValidation_1.parsePositiveInteger)(req.params.id);
            const { title, text } = req.body ?? {};
            if (!id) {
                res.status(400).json({
                    success: false,
                    error: "Invalid news ID",
                });
                return;
            }
            // Check if at least one field is provided
            if ((title === undefined && text === undefined) || (title !== undefined && !(0, requestValidation_1.isValidText)(title, 255)) || (text !== undefined && !(0, requestValidation_1.isValidText)(text, 50000))) {
                res.status(400).json({
                    success: false,
                    error: "At least one field (title or text) must be provided",
                });
                return;
            }
            const updatedNews = await newsService_1.NewsService.updateNews(id, { ...(title !== undefined ? { title } : {}), ...(text !== undefined ? { text } : {}) });
            if (!updatedNews) {
                res.status(404).json({
                    success: false,
                    error: "News not found",
                });
                return;
            }
            res.json({
                success: true,
                message: "News updated successfully",
                data: updatedNews,
            });
        }
        catch (error) {
            console.error("Error in updateNews controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update news",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async deleteNews(req, res) {
        try {
            const id = (0, requestValidation_1.parsePositiveInteger)(req.params.id);
            if (!id) {
                res.status(400).json({
                    success: false,
                    error: "Invalid news ID",
                });
                return;
            }
            const deleted = await newsService_1.NewsService.deleteNews(id);
            if (!deleted) {
                res.status(404).json({
                    success: false,
                    error: "News not found",
                });
                return;
            }
            res.json({
                success: true,
                message: "News deleted successfully",
            });
        }
        catch (error) {
            console.error("Error in deleteNews controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete news",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async getNewsByAuthor(req, res) {
        try {
            const created_by = (0, requestValidation_1.parsePositiveInteger)(req.params.userId);
            if (!created_by) {
                res.status(400).json({
                    success: false,
                    error: "Invalid user ID",
                });
                return;
            }
            const news = await newsService_1.NewsService.getNewsByAuthor(created_by);
            res.json({
                success: true,
                data: news,
                count: news.length,
            });
        }
        catch (error) {
            console.error("Error in getNewsByAuthor controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch news by author",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    // Image handling endpoints
    static async uploadNewsImages(req, res) {
        const files = req.files ?? [];
        let committed = false;
        try {
            const newsId = (0, requestValidation_1.parsePositiveInteger)(req.params.newsId);
            if (!newsId) {
                res.status(400).json({ success: false, error: 'INVALID_NEWS_ID' });
                return;
            }
            if (!files.length || files.some(file => !(0, multerConfig_1.hasValidImageSignature)(file))) {
                res.status(400).json({ success: false, error: 'INVALID_IMAGE' });
                return;
            }
            const images = await newsService_1.NewsService.addNewsImages(newsId, files);
            committed = true;
            res.status(201).json({ success: true, data: images });
        }
        catch (error) {
            const message = error.message;
            res.status(message === 'NEWS_NOT_FOUND' ? 404 : message === 'TOO_MANY_IMAGES' ? 400 : 500).json({ success: false, error: message === 'TOO_MANY_IMAGES' ? 'TOO_MANY_IMAGES' : 'IMAGE_UPLOAD_FAILED' });
        }
        finally {
            if (!committed)
                for (const file of files)
                    (0, multerConfig_1.deleteImageFile)(`uploads/news-images/${file.filename}`);
        }
    }
    static async getNewsImages(req, res) {
        try {
            const newsId = (0, requestValidation_1.parsePositiveInteger)(req.params.newsId);
            if (!newsId) {
                res.status(400).json({
                    success: false,
                    error: "Invalid news ID",
                });
                return;
            }
            const images = await newsService_1.NewsService.getNewsImages(newsId);
            const imagesWithUrls = images.map((image) => ({
                ...image,
                url: (0, multerConfig_1.generateImageUrl)(image.imagePath),
            }));
            res.json({
                success: true,
                data: imagesWithUrls,
            });
        }
        catch (error) {
            console.error("Error fetching news images:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch images",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async deleteNewsImage(req, res) {
        try {
            const imageId = (0, requestValidation_1.parsePositiveInteger)(req.params.imageId);
            if (!imageId) {
                res.status(400).json({
                    success: false,
                    error: "Invalid image ID",
                });
                return;
            }
            // Get image info before deletion
            const image = await newsService_1.NewsService.getImageById(imageId);
            if (!image) {
                res.status(404).json({
                    success: false,
                    error: "Image not found",
                });
                return;
            }
            // Delete from database
            const deleted = await newsService_1.NewsService.deleteNewsImage(imageId);
            if (!deleted) {
                res.status(404).json({
                    success: false,
                    error: "Failed to delete image from database",
                });
                return;
            }
            // Delete file from filesystem
            (0, multerConfig_1.deleteImageFile)(image.image_path);
            res.json({
                success: true,
                message: "Image deleted successfully",
            });
        }
        catch (error) {
            console.error("Error deleting news image:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete image",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async serveImage(req, res) {
        try {
            const fileName = req.params.fileName;
            if (path_1.default.basename(fileName) !== fileName) {
                res.status(400).json({ success: false, error: 'INVALID_IMAGE_NAME' });
                return;
            }
            const imagePath = path_1.default.join(multerConfig_1.uploadDir, fileName);
            // Check if file exists
            if (!fs_1.default.existsSync(imagePath)) {
                res.status(404).json({
                    success: false,
                    error: "Image not found",
                });
                return;
            }
            // Get image info from database for security
            const relativeImagePath = `uploads/news-images/${fileName}`;
            const imageInfo = await newsService_1.NewsService.getImageByPath(relativeImagePath);
            if (!imageInfo) {
                res.status(404).json({
                    success: false,
                    error: "Image not found in database",
                });
                return;
            }
            // Set appropriate content type
            res.setHeader("Content-Type", imageInfo.mime_type);
            res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
            // Send file
            res.sendFile(imagePath);
        }
        catch (error) {
            console.error("Error serving image:", error);
            res.status(500).json({
                success: false,
                error: "Failed to serve image",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
}
exports.NewsController = NewsController;
