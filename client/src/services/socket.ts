import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@shared/types";
import { useAuthStore } from "../store/authStore";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

const activeRooms = new Set<string>();

export function getSocket(): TypedSocket {
  const token = useAuthStore.getState().token;

  if (!socket) {
    socket = io(window.location.origin, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      auth: { token },
    });

    socket.on("connect", () => {
      for (const room of activeRooms) {
        socket!.emit("joinMatch", room);
      }
    });
  }
  return socket;
}

export function connectSocket() {
  const token = useAuthStore.getState().token;
  const s = getSocket();
  s.auth = { token };
  if (!s.connected) s.connect();
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    activeRooms.clear();
  }
}

export function joinMatchRoom(matchId: string) {
  activeRooms.add(matchId);
  const s = getSocket();
  if (s.connected) s.emit("joinMatch", matchId);
}

export function leaveMatchRoom(matchId: string) {
  activeRooms.delete(matchId);
  const s = getSocket();
  if (s.connected) s.emit("leaveMatch", matchId);
}
