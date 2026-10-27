"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImageUrl = exports.deleteImageFile = exports.uploadNewsImages = exports.uploadDir = void 0;
exports.hasValidImageSignature = hasValidImageSignature;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
require("../config/environment");
// Ensure upload directory exists
if (process.env.NODE_ENV !== 'test' && process.env.UPLOAD_DIRECTORY && !path_1.default.isAbsolute(process.env.UPLOAD_DIRECTORY))
    throw new Error('UPLOAD_DIRECTORY must be absolute');
exports.uploadDir = process.env.NODE_ENV === 'test' && process.env.MEKTEB_TEST_UPLOAD_DIRECTORY ? path_1.default.resolve(process.env.MEKTEB_TEST_UPLOAD_DIRECTORY) : process.env.NODE_ENV !== 'test' && process.env.UPLOAD_DIRECTORY ? process.env.UPLOAD_DIRECTORY : path_1.default.join(process.cwd(), "uploads", "news-images");
if (!fs_1.default.existsSync(exports.uploadDir)) {
    fs_1.default.mkdirSync(exports.uploadDir, { recursive: true });
}
// Configure multer storage
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, exports.uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: timestamp-randomnumber-originalname
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const fileExtension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[file.mimetype] ?? '.invalid';
        const fileName = `news-${uniqueSuffix}${fileExtension}`;
        cb(null, fileName);
    },
});
// File filter for images only
const fileFilter = (req, file, cb) => {
    // Check if file is an image
    if (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error("INVALID_IMAGE_TYPE"));
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
        if (!/^uploads\/news-images\/[^/\\]+$/.test(imagePath))
            return false;
        const fullPath = path_1.default.join(exports.uploadDir, path_1.default.basename(imagePath));
        const root = path_1.default.resolve(exports.uploadDir) + path_1.default.sep;
        if (!path_1.default.resolve(fullPath).startsWith(root))
            return false;
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
function hasValidImageSignature(file) {
    const bytes = Buffer.alloc(12), descriptor = fs_1.default.openSync(file.path, 'r');
    try {
        fs_1.default.readSync(descriptor, bytes, 0, 12, 0);
    }
    finally {
        fs_1.default.closeSync(descriptor);
    }
    if (file.mimetype === 'image/png')
        return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (file.mimetype === 'image/jpeg')
        return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (file.mimetype === 'image/gif')
        return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString());
    return file.mimetype === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
}
// Helper function to generate image URL
const generateImageUrl = (imagePath) => {
    return `/api/images/${path_1.default.basename(imagePath)}`;
};
exports.generateImageUrl = generateImageUrl;
