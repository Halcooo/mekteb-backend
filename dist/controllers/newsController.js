import { NewsService, } from "../services/newsService.js";
import { deleteImageFile, generateImageUrl, } from "../middleware/multerConfig.js";
import path from "path";
import fs from "fs";
export class NewsController {
    static async getAllNews(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            // Validate pagination parameters
            if (page < 1 || limit < 1 || limit > 100) {
                res.status(400).json({
                    success: false,
                    error: "Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100",
                });
                return;
            }
            const result = await NewsService.getAllNews(page, limit);
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
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid news ID",
                });
                return;
            }
            const news = await NewsService.getNewsById(id);
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
            const { title, text, subtitle } = req.body;
            // Basic validation
            if (!title || !text) {
                res.status(400).json({
                    success: false,
                    error: "Title and text are required",
                });
                return;
            }
            // Get user ID from JWT token (set by authenticateToken middleware)
            const created_by = req.user.userId;
            const newNews = await NewsService.createNews({
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
            const id = parseInt(req.params.id);
            const { title, text } = req.body;
            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid news ID",
                });
                return;
            }
            // Check if at least one field is provided
            if (!title && !text) {
                res.status(400).json({
                    success: false,
                    error: "At least one field (title or text) must be provided",
                });
                return;
            }
            const updatedNews = await NewsService.updateNews(id, { title, text });
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
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid news ID",
                });
                return;
            }
            const deleted = await NewsService.deleteNews(id);
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
            const created_by = parseInt(req.params.userId);
            if (isNaN(created_by)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid user ID",
                });
                return;
            }
            const news = await NewsService.getNewsByAuthor(created_by);
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
        try {
            const newsId = parseInt(req.params.newsId);
            if (isNaN(newsId)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid news ID",
                });
                return;
            }
            // Check if news exists
            const news = await NewsService.getNewsById(newsId);
            if (!news) {
                res.status(404).json({
                    success: false,
                    error: "News not found",
                });
                return;
            }
            const files = req.files;
            if (!files || files.length === 0) {
                res.status(400).json({
                    success: false,
                    error: "No images provided",
                });
                return;
            }
            const uploadedImages = [];
            for (const file of files) {
                const relativePath = `uploads/news-images/${file.filename}`;
                const imageId = await NewsService.addNewsImage(newsId, relativePath, file.originalname, file.size, file.mimetype);
                uploadedImages.push({
                    id: imageId,
                    path: relativePath,
                    url: generateImageUrl(relativePath),
                    originalName: file.originalname,
                    size: file.size,
                    mimeType: file.mimetype,
                });
            }
            res.status(201).json({
                success: true,
                message: "Images uploaded successfully",
                data: uploadedImages,
            });
        }
        catch (error) {
            console.error("Error uploading news images:", error);
            res.status(500).json({
                success: false,
                error: "Failed to upload images",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async getNewsImages(req, res) {
        try {
            const newsId = parseInt(req.params.newsId);
            if (isNaN(newsId)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid news ID",
                });
                return;
            }
            const images = await NewsService.getNewsImages(newsId);
            const imagesWithUrls = images.map((image) => ({
                ...image,
                url: generateImageUrl(image.imagePath),
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
            const imageId = parseInt(req.params.imageId);
            if (isNaN(imageId)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid image ID",
                });
                return;
            }
            // Get image info before deletion
            const image = await NewsService.getImageById(imageId);
            if (!image) {
                res.status(404).json({
                    success: false,
                    error: "Image not found",
                });
                return;
            }
            // Delete from database
            const deleted = await NewsService.deleteNewsImage(imageId);
            if (!deleted) {
                res.status(404).json({
                    success: false,
                    error: "Failed to delete image from database",
                });
                return;
            }
            // Delete file from filesystem
            deleteImageFile(image.image_path);
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
            const imagePath = path.join(process.cwd(), "uploads", "news-images", fileName);
            // Check if file exists
            if (!fs.existsSync(imagePath)) {
                res.status(404).json({
                    success: false,
                    error: "Image not found",
                });
                return;
            }
            // Get image info from database for security
            const relativeImagePath = `uploads/news-images/${fileName}`;
            const imageInfo = await NewsService.getImageByPath(relativeImagePath);
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
