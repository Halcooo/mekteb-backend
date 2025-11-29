"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const newsController_1 = require("../controllers/newsController");
const router = (0, express_1.Router)();
// GET /api/images/:fileName - Serve image files
router.get("/:fileName", newsController_1.NewsController.serveImage);
exports.default = router;
