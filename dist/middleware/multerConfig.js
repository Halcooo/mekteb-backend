import multer from "multer";
import path from "path";
import fs from "fs";
// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), "uploads", "news-images");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: timestamp-randomnumber-originalname
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const fileExtension = path.extname(file.originalname);
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
export const uploadNewsImages = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 5, // Maximum 5 files per upload
    },
});
// Helper function to delete file from filesystem
export const deleteImageFile = (imagePath) => {
    try {
        const fullPath = path.join(process.cwd(), imagePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            return true;
        }
        return false;
    }
    catch (error) {
        console.error("Error deleting image file:", error);
        return false;
    }
};
// Helper function to generate image URL
export const generateImageUrl = (imagePath) => {
    return `/api/images/${path.basename(imagePath)}`;
};
