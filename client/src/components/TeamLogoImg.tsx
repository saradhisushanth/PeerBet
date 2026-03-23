import type { CSSProperties } from "react";

/**
 * Team logo <img> with hints for faster perceived load (priority, decoding, intrinsic size).
 */
export type TeamLogoImgProps = {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** LCP / above-the-fold: high fetch priority */
  priority?: boolean;
  /**
   * Virtualized lists unmount rows on scroll — `lazy` re-runs load/decode every remount (looks like “reloading”).
   * Use default `eager` everywhere; set `lazy` only for below-the-fold, non-virtualized thumbnails.
   */
  loading?: "eager" | "lazy";
  /** Hint for layout (actual display may scale via CSS/transform) */
  width?: number;
  height?: number;
};

export default function TeamLogoImg({
  src,
  alt,
  className,
  style,
  priority = false,
  loading = "eager",
  width = 96,
  height = 96,
}: TeamLogoImgProps) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      width={width}
      height={height}
      decoding="async"
      loading={loading}
      fetchPriority={priority ? "high" : "low"}
      aria-hidden={alt === "" ? true : undefined}
    />
  );
}
