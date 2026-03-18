import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@shared/types";
import { useAuthStore } from "../store/authStore";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

export function getSocket(): TypedSocket {
  const token = useAuthStore.getState().token;

  if (!socket) {
    socket = io(window.location.origin, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: { token },
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
  }
}
