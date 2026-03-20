import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Board", end: true, title: "Match board — pick a side and place bets" },
  { to: "/leaderboard", label: "Leaderboard", end: false, title: "Rankings by coin balance" },
  { to: "/tournament", label: "Tournament", end: false, title: "Tournament info and standings" },
  { to: "/history", label: "History", end: false, title: "Past matches and your results" },
  { to: "/stats", label: "Profile", end: false, title: "Your profile, streak, and balance" },
] as const;

const navContent = (
  <nav
    className="fixed inset-x-0 bottom-0 z-[100] border-t border-gray-800 bg-gray-900/95 backdrop-blur-md"
    style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    aria-label="Main navigation"
  >
    <div className="grid grid-cols-5 max-w-lg mx-auto h-14 min-h-[56px] w-full">
      {tabs.map(({ to, label, end, title }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          title={title}
          className={({ isActive }) =>
            `flex items-center justify-center min-w-0 px-1 py-2 text-xs font-medium transition-colors touch-manipulation ${
              isActive ? "text-primary-400" : "text-gray-500 hover:text-gray-300"
            }`
          }
        >
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </div>
  </nav>
);

export default function BottomNav() {
  if (typeof document === "undefined") return navContent;
  return createPortal(navContent, document.body);
}
