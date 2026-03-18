/** Team logo paths (public folder). Add more as assets are added. */
const TEAM_LOGO: Record<string, string> = {
  RCB: "/teams/rcb.svg",
};

type TeamLabelProps = {
  shortName: string;
  name?: string;
  className?: string;
  logoSize?: "sm" | "md";
};

export default function TeamLabel({ shortName, name, className = "", logoSize = "sm" }: TeamLabelProps) {
  const src = TEAM_LOGO[shortName];
  const sizeClass = logoSize === "md" ? "h-6 w-6" : "h-4 w-4";

  if (src) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`} title={name}>
        <img src={src} alt="" className={`${sizeClass} flex-shrink-0`} aria-hidden />
        <span>{shortName}</span>
      </span>
    );
  }

  return <span className={className} title={name}>{shortName}</span>;
}
