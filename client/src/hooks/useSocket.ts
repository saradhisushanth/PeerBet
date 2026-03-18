import { useEffect, useRef } from "react";
import { getSocket, connectSocket, disconnectSocket } from "../services/socket";
import type { ServerToClientEvents } from "@shared/types";
import { useAuthStore } from "../store/authStore";

export function useSocket() {
  const socketRef = useRef(getSocket());
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token) {
      connectSocket();
      socketRef.current = getSocket();
    }
    return () => {
      disconnectSocket();
    };
  }, [token]);

  return socketRef.current;
}

export function useSocketEvent<K extends keyof ServerToClientEvents>(
  event: K,
  handler: ServerToClientEvents[K]
) {
  const socket = getSocket();

  useEffect(() => {
    socket.on(event, handler as never);
    return () => {
      socket.off(event, handler as never);
    };
  }, [socket, event, handler]);
}
