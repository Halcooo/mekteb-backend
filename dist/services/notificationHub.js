"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationHub = void 0;
const jwtService_1 = require("./jwtService");
class NotificationHubService {
    constructor() {
        this.wss = null;
        this.clientsByUser = new Map();
        this.wsOpenState = 1;
    }
    init(server) {
        if (this.wss) {
            return;
        }
        const wsModule = this.loadWsModule();
        if (!wsModule) {
            console.warn("[NotificationHub] WebSocket module is unavailable. Continuing without live notification push.");
            return;
        }
        if (typeof wsModule.WebSocket?.OPEN === "number") {
            this.wsOpenState = wsModule.WebSocket.OPEN;
        }
        this.wss = new wsModule.WebSocketServer({
            server,
            path: "/backend/ws/notifications",
        });
        this.wss.on("connection", (socket, request) => {
            const userId = this.resolveUserId(request);
            if (!userId) {
                socket.close(1008, "Unauthorized");
                return;
            }
            this.registerClient(userId, socket);
            socket.on("close", () => {
                this.unregisterClient(userId, socket);
            });
            socket.on("error", () => {
                this.unregisterClient(userId, socket);
            });
        });
    }
    notifyUsers(userIds, type) {
        const uniqueUserIds = Array.from(new Set(userIds)).filter((id) => Number.isInteger(id) && id > 0);
        uniqueUserIds.forEach((userId) => {
            this.publishToUser(userId, {
                type,
                recipientUserId: userId,
            });
        });
    }
    notifyUser(userId, type) {
        if (!Number.isInteger(userId) || userId <= 0) {
            return;
        }
        this.publishToUser(userId, {
            type,
            recipientUserId: userId,
        });
    }
    resolveUserId(request) {
        try {
            const rawUrl = request.url || "/";
            const url = new URL(rawUrl, "http://localhost");
            const token = url.searchParams.get("token");
            if (!token) {
                return null;
            }
            const payload = jwtService_1.JwtService.verifyAccessToken(token);
            if (!payload?.userId) {
                return null;
            }
            return payload.userId;
        }
        catch {
            return null;
        }
    }
    registerClient(userId, socket) {
        const clients = this.clientsByUser.get(userId) || new Set();
        clients.add(socket);
        this.clientsByUser.set(userId, clients);
    }
    unregisterClient(userId, socket) {
        const clients = this.clientsByUser.get(userId);
        if (!clients) {
            return;
        }
        clients.delete(socket);
        if (clients.size === 0) {
            this.clientsByUser.delete(userId);
        }
    }
    publishToUser(userId, payload) {
        const clients = this.clientsByUser.get(userId);
        if (!clients || clients.size === 0) {
            return;
        }
        const serialized = JSON.stringify(payload);
        clients.forEach((socket) => {
            if (socket.readyState === this.wsOpenState) {
                socket.send(serialized);
            }
        });
    }
    loadWsModule() {
        try {
            return require("ws");
        }
        catch {
            return null;
        }
    }
}
exports.NotificationHub = new NotificationHubService();
