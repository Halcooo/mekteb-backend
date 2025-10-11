import { Router } from "express";
import { NewsController } from "../controllers/newsController.js";

const router = Router();

// GET /api/images/:fileName - Serve image files
router.get("/:fileName", NewsController.serveImage);

export default router;
