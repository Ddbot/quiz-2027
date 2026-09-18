import { Route, Routes } from "react-router-dom";

import { AdminRoute } from "@/routes/AdminRoute";
import { JoinCodeLandingRoute } from "@/routes/JoinCodeLandingRoute";
import { PrivacyRoute } from "@/routes/legal/PrivacyRoute";
import { TermsRoute } from "@/routes/legal/TermsRoute";
import { PlayerRoute } from "@/routes/PlayerRoute";
import { ScreenRoute } from "@/routes/ScreenRoute";

/**
 * Top-level route tree. The player route runs the real onboarding flow
 * (MILESTONE-03); the big-screen route runs the real `role = screen`
 * receiver (MILESTONE-09). `/` is the join-code landing page (FR-001's
 * "manual entry") — it used to redirect straight to `/admin`, a MILESTONE-01
 * scaffold placeholder nobody had replaced since.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<JoinCodeLandingRoute />} />
      <Route path="/e/:joinCode" element={<PlayerRoute />} />
      <Route path="/admin/*" element={<AdminRoute />} />
      <Route path="/screen/:eventId" element={<ScreenRoute />} />
      <Route path="/legal/terms" element={<TermsRoute />} />
      <Route path="/legal/privacy" element={<PrivacyRoute />} />
      <Route path="*" element={<p role="alert">404 — page introuvable</p>} />
    </Routes>
  );
}
