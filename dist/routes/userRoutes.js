"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const router = (0, express_1.Router)();
// GET /api/users - Get all users
router.get("/", userController_1.UserController.getAllUsers);
// Add more user routes here as needed
// router.get("/:id", UserController.getUserById);
// router.post("/", UserController.createUser);
// router.put("/:id", UserController.updateUser);
// router.delete("/:id", UserController.deleteUser);
exports.default = router;
