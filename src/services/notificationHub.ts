import { Server as HttpServer, IncomingMessage } from "http";
import { JwtService } from "./jwtService";

type RuntimeWebSocket = {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: "close" | "error", listener: () => void) => void;
};

type RuntimeWebSocketServer = {
  on: (
    event: "connection",
    listener: (socket: RuntimeWebSocket, request: IncomingMessage) => void,
  ) => void;
};

type WsModule = {
  WebSocketServer: new (options: {
    server: HttpServer;
    path: string;
  }) => RuntimeWebSocketServer;
  WebSocket?: {
    OPEN: number;
  };
};

type NotificationEvent = {
  type: "notification:new" | "notification:update";
  recipientUserId: number;
};

class NotificationHubService {
  private wss: RuntimeWebSocketServer | null = null;
  private clientsByUser = new Map<number, Set<RuntimeWebSocket>>();
  private wsOpenState = 1;

  init(server: HttpServer): void {
    if (this.wss) {
      return;
    }

    const wsModule = this.loadWsModule();
    if (!wsModule) {
      console.warn(
        "[NotificationHub] WebSocket module is unavailable. Continuing without live notification push.",
      );
      return;
    }

    if (typeof wsModule.WebSocket?.OPEN === "number") {
      this.wsOpenState = wsModule.WebSocket.OPEN;
    }

    this.wss = new wsModule.WebSocketServer({
      server,
      path: "/backend/ws/notifications",
    });

    this.wss.on(
      "connection",
      (socket: RuntimeWebSocket, request: IncomingMessage) => {
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
      },
    );
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

  private registerClient(userId: number, socket: RuntimeWebSocket): void {
    const clients =
      this.clientsByUser.get(userId) || new Set<RuntimeWebSocket>();
    clients.add(socket);
    this.clientsByUser.set(userId, clients);
  }

  private unregisterClient(userId: number, socket: RuntimeWebSocket): void {
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
      if (socket.readyState === this.wsOpenState) {
        socket.send(serialized);
      }
    });
  }

  private loadWsModule(): WsModule | null {
    try {
      return require("ws") as WsModule;
    } catch {
      return null;
    }
  }
}

export const NotificationHub = new NotificationHubService();
