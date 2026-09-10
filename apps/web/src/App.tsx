import { Navigate, Route, Routes } from "react-router-dom";

import { AdminRoute } from "@/routes/AdminRoute";
import { PlayerRoute } from "@/routes/PlayerRoute";
import { ScreenRoute } from "@/routes/ScreenRoute";

/** Top-level route tree. Every surface is a placeholder shell for MILESTONE-01. */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/e/:joinCode" element={<PlayerRoute />} />
      <Route path="/admin/*" element={<AdminRoute />} />
      <Route path="/screen/:eventId" element={<ScreenRoute />} />
      <Route path="*" element={<p role="alert">404 — page introuvable</p>} />
    </Routes>
  );
}
