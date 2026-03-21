import { getTeamLogo, getTeamLogoVisualScale, resolveTeamShortName } from "../utils/teamLogos";

type TeamLabelProps = {
  shortName: string;
  name?: string;
  className?: string;
  logoSize?: "sm" | "md";
};

export default function TeamLabel({ shortName, name, className = "", logoSize = "sm" }: TeamLabelProps) {
  const resolvedShortName = resolveTeamShortName(shortName, name);
  const src = getTeamLogo(shortName, name);
  const logoScale = getTeamLogoVisualScale(shortName, name);
  const sizeClass = logoSize === "md" ? "h-6 w-6" : "h-4 w-4";

  if (src) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`} title={name}>
        <img
          src={src}
          alt=""
          className={`${sizeClass} flex-shrink-0`}
          style={{ transform: `scale(${logoScale})` }}
          aria-hidden
        />
        <span>{resolvedShortName || shortName}</span>
      </span>
    );
  }

  return <span className={className} title={name}>{resolvedShortName || shortName}</span>;
}
