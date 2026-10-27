import { Request, Response } from "express";
import {
  NewsService,
  CreateNewsData,
  UpdateNewsData,
} from "../services/newsService";
import {
  deleteImageFile,
  generateImageUrl,
  hasValidImageSignature,
  uploadDir,
} from "../middleware/multerConfig";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import path from "path";
import fs from "fs";
import {isValidText,parsePositiveInteger} from '../utils/requestValidation';

export class NewsController {
  static async getAllNews(req: Request, res: Response): Promise<void> {
    try {
      const page = req.query.page===undefined?1:parsePositiveInteger(req.query.page);
      const limit = req.query.limit===undefined?10:parsePositiveInteger(req.query.limit);

      // Validate pagination parameters
      if (!page || !limit || limit > 100 || !Number.isSafeInteger((page-1)*limit)) {
        res.status(400).json({
          success: false,
          error:
            "Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100",
        });
        return;
      }

      const result = await NewsService.getAllNews(page, limit);
      res.json(result);
    } catch (error) {
      console.error("Error in getAllNews controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch news",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async getNewsById(req: Request, res: Response): Promise<void> {
    try {
      const id = parsePositiveInteger(req.params.id);

      if (!id) {
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
    } catch (error) {
      console.error("Error in getNewsById controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch news",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async createNews(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { title, text, subtitle } = req.body??{};

      // Basic validation
      if (!isValidText(title,255) || !isValidText(text,50000) || (subtitle!==undefined && !isValidText(subtitle,255))) {
        res.status(400).json({
          success: false,
          error: "Title and text are required",
        });
        return;
      }

      // Get user ID from JWT token (set by authenticateToken middleware)
      const created_by = req.user!.userId;

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
    } catch (error) {
      console.error("Error in createNews controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create news",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async updateNews(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const id = parsePositiveInteger(req.params.id);
      const { title, text }: UpdateNewsData = req.body??{};

      if (!id) {
        res.status(400).json({
          success: false,
          error: "Invalid news ID",
        });
        return;
      }

      // Check if at least one field is provided
      if ((title===undefined && text===undefined) || (title!==undefined&&!isValidText(title,255)) || (text!==undefined&&!isValidText(text,50000))) {
        res.status(400).json({
          success: false,
          error: "At least one field (title or text) must be provided",
        });
        return;
      }

      const updatedNews = await NewsService.updateNews(id, { ...(title!==undefined?{title}:{}), ...(text!==undefined?{text}:{}) });

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
    } catch (error) {
      console.error("Error in updateNews controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update news",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async deleteNews(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const id = parsePositiveInteger(req.params.id);

      if (!id) {
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
    } catch (error) {
      console.error("Error in deleteNews controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete news",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async getNewsByAuthor(req: Request, res: Response): Promise<void> {
    try {
      const created_by = parsePositiveInteger(req.params.userId);

      if (!created_by) {
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
    } catch (error) {
      console.error("Error in getNewsByAuthor controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch news by author",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  // Image handling endpoints
  static async uploadNewsImages(req:AuthenticatedRequest,res:Response):Promise<void>{
    const files=(req.files as Express.Multer.File[]|undefined)??[];
    let committed=false;
    try {
      const newsId=parsePositiveInteger(req.params.newsId);
      if(!newsId){res.status(400).json({success:false,error:'INVALID_NEWS_ID'});return;}
      if(!files.length||files.some(file=>!hasValidImageSignature(file))){res.status(400).json({success:false,error:'INVALID_IMAGE'});return;}
      const images=await NewsService.addNewsImages(newsId,files);
      committed=true;res.status(201).json({success:true,data:images});
    }catch(error){
      const message=(error as Error).message;
      res.status(message==='NEWS_NOT_FOUND'?404:message==='TOO_MANY_IMAGES'?400:500).json({success:false,error:message==='TOO_MANY_IMAGES'?'TOO_MANY_IMAGES':'IMAGE_UPLOAD_FAILED'});
    }finally{if(!committed)for(const file of files)deleteImageFile(`uploads/news-images/${file.filename}`);}
  }
  static async getNewsImages(req: Request, res: Response): Promise<void> {
    try {
      const newsId = parsePositiveInteger(req.params.newsId);

      if (!newsId) {
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
    } catch (error) {
      console.error("Error fetching news images:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch images",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async deleteNewsImage(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const imageId = parsePositiveInteger(req.params.imageId);

      if (!imageId) {
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
    } catch (error) {
      console.error("Error deleting news image:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete image",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async serveImage(req: Request, res: Response): Promise<void> {
    try {
      const fileName = req.params.fileName;
      if(path.basename(fileName)!==fileName){res.status(400).json({success:false,error:'INVALID_IMAGE_NAME'});return;}
      const imagePath = path.join(
        uploadDir,
        fileName
      );

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
    } catch (error) {
      console.error("Error serving image:", error);
      res.status(500).json({
        success: false,
        error: "Failed to serve image",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }
}
