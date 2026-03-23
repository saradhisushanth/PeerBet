import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error(err instanceof Error ? err.stack ?? err : err);

  const error =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err instanceof Error && err.message
        ? err.message
        : typeof err === "string"
          ? err
          : "Unexpected server error";

  res.status(500).json({ success: false, error });
}
