import { Navigate, Route, Routes } from "react-router-dom";

import { AdminRoute } from "@/routes/AdminRoute";
import { PrivacyRoute } from "@/routes/legal/PrivacyRoute";
import { TermsRoute } from "@/routes/legal/TermsRoute";
import { PlayerRoute } from "@/routes/PlayerRoute";
import { ScreenRoute } from "@/routes/ScreenRoute";

/**
 * Top-level route tree. The player route runs the real onboarding flow
 * (MILESTONE-03); admin and big-screen are still placeholder shells pending
 * their own milestones.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/e/:joinCode" element={<PlayerRoute />} />
      <Route path="/admin/*" element={<AdminRoute />} />
      <Route path="/screen/:eventId" element={<ScreenRoute />} />
      <Route path="/legal/terms" element={<TermsRoute />} />
      <Route path="/legal/privacy" element={<PrivacyRoute />} />
      <Route path="*" element={<p role="alert">404 — page introuvable</p>} />
    </Routes>
  );
}
