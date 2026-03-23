import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { Grid, Trophy, Target, History, User } from "lucide-react";

const tabs = [
  { to: "/", label: "Board", icon: Grid, title: "Match board" },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy, title: "Rankings" },
  { to: "/tournament", label: "Tournament", icon: Target, title: "Tournament" },
  { to: "/history", label: "History", icon: History, title: "Bet history" },
  { to: "/stats", label: "Profile", icon: User, title: "Your profile" },
] as const;

const navContent = (
  <nav
    className="fixed inset-x-0 bottom-0 z-[100] lg:hidden border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_-8px_24px_rgba(15,23,42,0.08)]"
    style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    aria-label="Main navigation"
  >
    <div className="grid grid-cols-5 max-w-lg mx-auto h-[72px] min-h-[72px] w-full px-1.5">
      {tabs.map(({ to, icon: Icon, title, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          title={title}
          className={({ isActive }) =>
            `relative flex flex-col items-center justify-center gap-1 w-full h-full transition-colors touch-manipulation ${
              isActive ? "text-rose-600" : "text-slate-500 hover:text-slate-700"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`h-[18px] w-[18px] ${isActive ? "stroke-[2.2]" : "stroke-2"}`} />
              <span className="text-[10px] leading-none font-semibold tracking-[0.01em]">{label}</span>
              {isActive && <span className="absolute bottom-1.5 h-1 w-6 rounded-full bg-rose-600" aria-hidden />}
            </>
          )}
        </NavLink>
      ))}
    </div>
  </nav>
);

export default function BottomNav() {
  if (typeof document === "undefined") return navContent;
  return createPortal(navContent, document.body);
}
