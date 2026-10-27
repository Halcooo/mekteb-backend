"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationHub = void 0;
const ws_1 = require("ws");
const environment_1 = require("../config/environment");
const jwtService_1 = require("./jwtService");
const sessionService_1 = require("./sessionService");
class NotificationHubService {
    constructor() {
        this.wss = null;
        this.clients = new Set();
    }
    init(server) {
        if (this.wss)
            return;
        const wss = new ws_1.WebSocketServer({ server, path: "/backend/ws/notifications", maxPayload: 4096 });
        this.wss = wss;
        wss.on("connection", (socket, request) => {
            socket.on('error', () => socket.close());
            if (!request.headers.origin || !(0, environment_1.getAllowedOrigins)().includes(request.headers.origin)) {
                socket.close(1008, 'Origin not allowed');
                return;
            }
            // Never place bearer credentials in a URL or proxy access log.
            const authenticationTimeout = setTimeout(() => socket.close(1008, 'Authentication required'), 5000);
            authenticationTimeout.unref();
            socket.once('close', () => clearTimeout(authenticationTimeout));
            socket.once('message', raw => {
                clearTimeout(authenticationTimeout);
                void (async () => {
                    try {
                        const message = JSON.parse(raw.toString());
                        const identity = message.type === 'authenticate' && typeof message.accessToken === 'string' ? jwtService_1.JwtService.verifyAccessToken(message.accessToken) : null;
                        if (!identity || !await sessionService_1.SessionService.isSessionActive(identity.sid, identity.userId)) {
                            socket.close(1008, 'Unauthorized');
                            return;
                        }
                        if (this.wss !== wss || socket.readyState !== ws_1.WebSocket.OPEN)
                            return;
                        const expiryTimer = setTimeout(() => socket.close(1008, 'Token expired'), Math.max(0, identity.exp * 1000 - Date.now()));
                        expiryTimer.unref();
                        const client = { socket, identity, expiryTimer };
                        this.clients.add(client);
                        socket.send(JSON.stringify({ type: 'ready' }));
                        socket.once('close', () => { clearTimeout(expiryTimer); this.clients.delete(client); });
                    }
                    catch {
                        socket.close(1011, 'Authentication unavailable');
                    }
                })();
            });
        });
        server.once("close", () => { if (this.wss === wss)
            this.close(); });
    }
    // Call before HTTP server.close(): upgraded sockets otherwise keep it waiting.
    close() {
        const wss = this.wss;
        if (!wss)
            return;
        this.wss = null;
        for (const client of this.clients)
            clearTimeout(client.expiryTimer);
        this.clients.clear();
        // Include sockets whose asynchronous authentication has not finished yet.
        for (const socket of wss.clients)
            socket.terminate();
        wss.close();
    }
    disconnectSession(sessionId) {
        for (const client of this.clients)
            if (client.identity.sid === sessionId)
                client.socket.close(1008, "Session revoked");
    }
    disconnectUser(userId) {
        for (const client of this.clients)
            if (client.identity.userId === userId)
                client.socket.close(1008, "Session revoked");
    }
    notifyUsers(userIds, type) {
        for (const userId of new Set(userIds))
            this.notifyUser(userId, type);
    }
    notifyUser(userId, type) {
        if (!Number.isSafeInteger(userId) || userId <= 0)
            return;
        for (const client of this.clients) {
            if (client.identity.userId === userId)
                void this.publish(client, { type, recipientUserId: userId });
        }
    }
    async publish(client, event) {
        try {
            // Recheck before delivery, including revocations made by another server.
            if (client.identity.exp * 1000 <= Date.now() || !await sessionService_1.SessionService.isSessionActive(client.identity.sid, client.identity.userId)) {
                client.socket.close(1008, "Session revoked");
                return;
            }
            if (client.socket.readyState === ws_1.WebSocket.OPEN)
                client.socket.send(JSON.stringify(event));
        }
        catch {
            client.socket.close(1011, "Authentication unavailable");
        }
    }
}
exports.NotificationHub = new NotificationHubService();
