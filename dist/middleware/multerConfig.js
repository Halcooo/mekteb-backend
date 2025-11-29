"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImageUrl = exports.deleteImageFile = exports.uploadNewsImages = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Ensure upload directory exists
const uploadDir = path_1.default.join(process.cwd(), "uploads", "news-images");
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
// Configure multer storage
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: timestamp-randomnumber-originalname
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const fileExtension = path_1.default.extname(file.originalname);
        const fileName = `news-${uniqueSuffix}${fileExtension}`;
        cb(null, fileName);
    },
});
// File filter for images only
const fileFilter = (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith("image/")) {
        cb(null, true);
    }
    else {
        cb(new Error("Only image files are allowed!"));
    }
};
// Configure multer
exports.uploadNewsImages = (0, multer_1.default)({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 5, // Maximum 5 files per upload
    },
});
// Helper function to delete file from filesystem
const deleteImageFile = (imagePath) => {
    try {
        const fullPath = path_1.default.join(process.cwd(), imagePath);
        if (fs_1.default.existsSync(fullPath)) {
            fs_1.default.unlinkSync(fullPath);
            return true;
        }
        return false;
    }
    catch (error) {
        console.error("Error deleting image file:", error);
        return false;
    }
};
exports.deleteImageFile = deleteImageFile;
// Helper function to generate image URL
const generateImageUrl = (imagePath) => {
    return `/api/images/${path_1.default.basename(imagePath)}`;
};
exports.generateImageUrl = generateImageUrl;
