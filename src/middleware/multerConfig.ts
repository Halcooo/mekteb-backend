import multer from "multer";
import path from "path";
import { Request } from "express";
import fs from "fs";
import '../config/environment';

// Ensure upload directory exists
if(process.env.NODE_ENV!=='test'&&process.env.UPLOAD_DIRECTORY&&!path.isAbsolute(process.env.UPLOAD_DIRECTORY))throw new Error('UPLOAD_DIRECTORY must be absolute');
export const uploadDir = process.env.NODE_ENV==='test'&&process.env.MEKTEB_TEST_UPLOAD_DIRECTORY ? path.resolve(process.env.MEKTEB_TEST_UPLOAD_DIRECTORY) : process.env.NODE_ENV!=='test'&&process.env.UPLOAD_DIRECTORY ? process.env.UPLOAD_DIRECTORY : path.join(process.cwd(), "uploads", "news-images");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, uploadDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Generate unique filename: timestamp-randomnumber-originalname
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExtension = ({'image/png':'.png','image/jpeg':'.jpg','image/gif':'.gif','image/webp':'.webp'} as Record<string,string>)[file.mimetype]??'.invalid';
    const fileName = `news-${uniqueSuffix}${fileExtension}`;
    cb(null, fileName);
  },
});

// File filter for images only
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Check if file is an image
  if (["image/png","image/jpeg","image/gif","image/webp"].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("INVALID_IMAGE_TYPE"));
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
export const deleteImageFile = (imagePath: string): boolean => {
  try {
    if(!/^uploads\/news-images\/[^/\\]+$/.test(imagePath))return false;
    const fullPath = path.join(uploadDir,path.basename(imagePath));
    const root=path.resolve(uploadDir)+path.sep;
    if(!path.resolve(fullPath).startsWith(root))return false;
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error deleting image file:", error);
    return false;
  }
};

export function hasValidImageSignature(file:Express.Multer.File):boolean {
  const bytes=Buffer.alloc(12),descriptor=fs.openSync(file.path,'r');
  try{fs.readSync(descriptor,bytes,0,12,0);}finally{fs.closeSync(descriptor);}
  if(file.mimetype==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(file.mimetype==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(file.mimetype==='image/gif')return ['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString());
  return file.mimetype==='image/webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
}

// Helper function to generate image URL
export const generateImageUrl = (imagePath: string): string => {
  return `/api/images/${path.basename(imagePath)}`;
};
