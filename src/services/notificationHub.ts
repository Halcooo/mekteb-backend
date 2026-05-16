import { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { JwtService } from "./jwtService";

type NotificationEvent = {
  type: "notification:new" | "notification:update";
  recipientUserId: number;
};

class NotificationHubService {
  private wss: WebSocketServer | null = null;
  private clientsByUser = new Map<number, Set<WebSocket>>();

  init(server: HttpServer): void {
    if (this.wss) {
      return;
    }

    this.wss = new WebSocketServer({
      server,
      path: "/backend/ws/notifications",
    });

    this.wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
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

  notifyUsers(userIds: number[], type: NotificationEvent["type"]): void {
    const uniqueUserIds = Array.from(new Set(userIds)).filter(
      (id) => Number.isInteger(id) && id > 0,
    );

    uniqueUserIds.forEach((userId) => {
      this.publishToUser(userId, {
        type,
        recipientUserId: userId,
      });
    });
  }

  notifyUser(userId: number, type: NotificationEvent["type"]): void {
    if (!Number.isInteger(userId) || userId <= 0) {
      return;
    }

    this.publishToUser(userId, {
      type,
      recipientUserId: userId,
    });
  }

  private resolveUserId(request: IncomingMessage): number | null {
    try {
      const rawUrl = request.url || "/";
      const url = new URL(rawUrl, "http://localhost");
      const token = url.searchParams.get("token");

      if (!token) {
        return null;
      }

      const payload = JwtService.verifyAccessToken(token);
      if (!payload?.userId) {
        return null;
      }

      return payload.userId;
    } catch {
      return null;
    }
  }

  private registerClient(userId: number, socket: WebSocket): void {
    const clients = this.clientsByUser.get(userId) || new Set<WebSocket>();
    clients.add(socket);
    this.clientsByUser.set(userId, clients);
  }

  private unregisterClient(userId: number, socket: WebSocket): void {
    const clients = this.clientsByUser.get(userId);
    if (!clients) {
      return;
    }

    clients.delete(socket);
    if (clients.size === 0) {
      this.clientsByUser.delete(userId);
    }
  }

  private publishToUser(userId: number, payload: NotificationEvent): void {
    const clients = this.clientsByUser.get(userId);
    if (!clients || clients.size === 0) {
      return;
    }

    const serialized = JSON.stringify(payload);

    clients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(serialized);
      }
    });
  }
}

export const NotificationHub = new NotificationHubService();
