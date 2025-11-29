"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const parentController_js_1 = require("../controllers/parentController.js");
const authMiddleware_js_1 = require("../middleware/authMiddleware.js");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(authMiddleware_js_1.authenticateToken);
// POST /api/parent/connect - Connect to student using parent key
router.post("/connect", parentController_js_1.ParentController.connectToStudent);
// GET /api/parent/students - Get connected students
router.get("/students", parentController_js_1.ParentController.getConnectedStudents);
// DELETE /api/parent/students/:studentId - Disconnect from student
router.delete("/students/:studentId", parentController_js_1.ParentController.disconnectFromStudent);
exports.default = router;
