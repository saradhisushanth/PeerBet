import { useEffect, useRef } from "react";
import { getSocket, connectSocket, disconnectSocket } from "../services/socket";
import type { ServerToClientEvents } from "@shared/types";
import { useAuthStore } from "../store/authStore";

/**
 * Manages the socket connection lifecycle. Should be called once in a
 * long-lived component (Layout). Connects when a token exists, disconnects
 * on logout (token → null). Re-connects when the browser tab regains focus.
 */
export function useSocket() {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token) {
      connectSocket();
    } else {
      disconnectSocket();
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        connectSocket();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [token]);

  return getSocket();
}

export function useSocketEvent<K extends keyof ServerToClientEvents>(
  event: K,
  handler: ServerToClientEvents[K]
) {
  const savedHandler = useRef(handler);
  savedHandler.current = handler;

  useEffect(() => {
    const socket = getSocket();
    const listener = ((...args: unknown[]) => {
      (savedHandler.current as (...a: unknown[]) => void)(...args);
    }) as never;

    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [event]);
}
