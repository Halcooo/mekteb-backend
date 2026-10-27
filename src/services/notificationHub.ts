import { Server as HttpServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { getAllowedOrigins } from "../config/environment";
import { JwtService, JwtPayload } from "./jwtService";
import { SessionService } from "./sessionService";

type NotificationEvent = { type: "notification:new" | "notification:update"; recipientUserId: number };
type Client = { socket: WebSocket; identity: JwtPayload; expiryTimer: NodeJS.Timeout };

class NotificationHubService {
  private wss: WebSocketServer | null = null;
  private clients = new Set<Client>();

  init(server: HttpServer): void {
    if (this.wss) return;
    const wss = new WebSocketServer({ server, path: "/backend/ws/notifications", maxPayload: 4096 });
    this.wss = wss;
    wss.on("connection", (socket, request) => {
      socket.on('error', () => socket.close());
      if (!request.headers.origin || !getAllowedOrigins().includes(request.headers.origin)) {
        socket.close(1008, 'Origin not allowed'); return;
      }
      // Never place bearer credentials in a URL or proxy access log.
      const authenticationTimeout = setTimeout(() => socket.close(1008,'Authentication required'),5000);
      authenticationTimeout.unref();
      socket.once('close',()=>clearTimeout(authenticationTimeout));
      socket.once('message',raw=>{
        clearTimeout(authenticationTimeout);
        void (async()=>{
          try {
            const message = JSON.parse(raw.toString()) as {type?:string;accessToken?:string};
            const identity = message.type==='authenticate' && typeof message.accessToken==='string' ? JwtService.verifyAccessToken(message.accessToken) : null;
            if(!identity || !await SessionService.isSessionActive(identity.sid,identity.userId)) { socket.close(1008,'Unauthorized'); return; }
            if(this.wss!==wss || socket.readyState!==WebSocket.OPEN)return;
            const expiryTimer=setTimeout(()=>socket.close(1008,'Token expired'),Math.max(0,identity.exp*1000-Date.now()));
            expiryTimer.unref();
            const client={socket,identity,expiryTimer};this.clients.add(client);
            socket.send(JSON.stringify({type:'ready'}));
            socket.once('close',()=>{clearTimeout(expiryTimer);this.clients.delete(client);});
          } catch {socket.close(1011,'Authentication unavailable');}
        })();
      });
    });    server.once("close", () => { if (this.wss === wss) this.close(); });
  }

  // Call before HTTP server.close(): upgraded sockets otherwise keep it waiting.
  close(): void {
    const wss = this.wss;
    if (!wss) return;
    this.wss = null;
    for (const client of this.clients) clearTimeout(client.expiryTimer);
    this.clients.clear();
    // Include sockets whose asynchronous authentication has not finished yet.
    for (const socket of wss.clients) socket.terminate();
    wss.close();
  }

  disconnectSession(sessionId: string): void {
    for (const client of this.clients) if (client.identity.sid === sessionId) client.socket.close(1008, "Session revoked");
  }

  disconnectUser(userId: number): void {
    for (const client of this.clients) if (client.identity.userId === userId) client.socket.close(1008, "Session revoked");
  }

  notifyUsers(userIds: number[], type: NotificationEvent["type"]): void {
    for (const userId of new Set(userIds)) this.notifyUser(userId, type);
  }

  notifyUser(userId: number, type: NotificationEvent["type"]): void {
    if (!Number.isSafeInteger(userId) || userId <= 0) return;
    for (const client of this.clients) {
      if (client.identity.userId === userId) void this.publish(client, { type, recipientUserId: userId });
    }
  }

  private async publish(client: Client, event: NotificationEvent): Promise<void> {
    try {
      // Recheck before delivery, including revocations made by another server.
      if (client.identity.exp * 1000 <= Date.now() || !await SessionService.isSessionActive(client.identity.sid, client.identity.userId)) {
        client.socket.close(1008, "Session revoked"); return;
      }
      if (client.socket.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify(event));
    } catch { client.socket.close(1011, "Authentication unavailable"); }
  }
}

export const NotificationHub = new NotificationHubService();
