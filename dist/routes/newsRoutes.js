"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const newsController_js_1 = require("../controllers/newsController.js");
const authMiddleware_js_1 = require("../middleware/authMiddleware.js");
const multerConfig_js_1 = require("../middleware/multerConfig.js");
const router = (0, express_1.Router)();
// GET /api/news - Get all news
router.get("/", newsController_js_1.NewsController.getAllNews);
// GET /api/news/:id - Get news by ID
router.get("/:id", newsController_js_1.NewsController.getNewsById);
// POST /api/news - Create new news (Admin only)
router.post("/", authMiddleware_js_1.authenticateToken, (0, authMiddleware_js_1.requireRole)("admin"), newsController_js_1.NewsController.createNews);
// PUT /api/news/:id - Update news by ID (Admin only)
router.put("/:id", authMiddleware_js_1.authenticateToken, (0, authMiddleware_js_1.requireRole)("admin"), newsController_js_1.NewsController.updateNews);
// DELETE /api/news/:id - Delete news by ID (Admin only)
router.delete("/:id", authMiddleware_js_1.authenticateToken, (0, authMiddleware_js_1.requireRole)("admin"), newsController_js_1.NewsController.deleteNews);
// GET /api/news/author/:userId - Get news by author/user ID
router.get("/author/:userId", newsController_js_1.NewsController.getNewsByAuthor);
// Image handling routes
// POST /api/news/:newsId/images - Upload images for news (Admin only)
router.post("/:newsId/images", authMiddleware_js_1.authenticateToken, (0, authMiddleware_js_1.requireRole)("admin"), multerConfig_js_1.uploadNewsImages.array("images", 5), // Allow up to 5 images
newsController_js_1.NewsController.uploadNewsImages);
// GET /api/news/:newsId/images - Get images for news
router.get("/:newsId/images", newsController_js_1.NewsController.getNewsImages);
// DELETE /api/news/images/:imageId - Delete specific image (Admin only)
router.delete("/images/:imageId", authMiddleware_js_1.authenticateToken, (0, authMiddleware_js_1.requireRole)("admin"), newsController_js_1.NewsController.deleteNewsImage);
exports.default = router;
