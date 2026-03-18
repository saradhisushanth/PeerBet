import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./screens/Login";
import Register from "./screens/Register";
import Matches from "./screens/Matches";
import MatchDetail from "./screens/MatchDetail";
import LeaderboardScreen from "./screens/LeaderboardScreen";
import MyBets from "./screens/MyBets";
import Stats from "./screens/Stats";
import TournamentScreen from "./screens/TournamentScreen";

export default function App() {
  const token = useAuthStore((s) => s.token);

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/register"
        element={token ? <Navigate to="/" replace /> : <Register />}
      />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Matches />} />
          <Route path="/matches/:id" element={<MatchDetail />} />
          <Route path="/leaderboard" element={<LeaderboardScreen />} />
          <Route path="/history" element={<MyBets />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/tournament" element={<TournamentScreen />} />
        </Route>
      </Route>
    </Routes>
  );
}
