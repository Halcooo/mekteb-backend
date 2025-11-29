import { Router } from "express";
import { NewsController } from "../controllers/newsController";
import {
  authenticateToken,
  requireRole,
} from "../middleware/authMiddleware";
import { uploadNewsImages } from "../middleware/multerConfig";

const router = Router();

// GET /api/news - Get all news
router.get("/", NewsController.getAllNews);

// GET /api/news/:id - Get news by ID
router.get("/:id", NewsController.getNewsById);

// POST /api/news - Create new news (Admin only)
router.post(
  "/",
  authenticateToken,
  requireRole("admin"),
  NewsController.createNews
);

// PUT /api/news/:id - Update news by ID (Admin only)
router.put(
  "/:id",
  authenticateToken,
  requireRole("admin"),
  NewsController.updateNews
);

// DELETE /api/news/:id - Delete news by ID (Admin only)
router.delete(
  "/:id",
  authenticateToken,
  requireRole("admin"),
  NewsController.deleteNews
);

// GET /api/news/author/:userId - Get news by author/user ID
router.get("/author/:userId", NewsController.getNewsByAuthor);

// Image handling routes
// POST /api/news/:newsId/images - Upload images for news (Admin only)
router.post(
  "/:newsId/images",
  authenticateToken,
  requireRole("admin"),
  uploadNewsImages.array("images", 5), // Allow up to 5 images
  NewsController.uploadNewsImages
);

// GET /api/news/:newsId/images - Get images for news
router.get("/:newsId/images", NewsController.getNewsImages);

// DELETE /api/news/images/:imageId - Delete specific image (Admin only)
router.delete(
  "/images/:imageId",
  authenticateToken,
  requireRole("admin"),
  NewsController.deleteNewsImage
);

export default router;
