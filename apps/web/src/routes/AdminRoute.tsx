import { Route, Routes } from "react-router-dom";

import { AdminGuard } from "@/routes/admin/AdminGuard";
import { adminCopy } from "@/routes/admin/copy";
import { EventEditorPage } from "@/routes/admin/EventEditorPage";
import { EventListPage } from "@/routes/admin/EventListPage";
import { LiveControlPage } from "@/routes/admin/LiveControlPage";
import { StepEditorPage } from "@/routes/admin/StepEditorPage";

/**
 * Admin console surface (French only — MILESTONE-04). Gated by
 * `AdminGuard` (sign-in + `profile.is_admin`); real content replaces the
 * MILESTONE-01 placeholder.
 */
export function AdminRoute() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{adminCopy.heading}</h1>
      <AdminGuard>
        <Routes>
          <Route path="/" element={<EventListPage />} />
          <Route path="events/:eventId" element={<EventEditorPage />} />
          <Route path="events/:eventId/steps/:stepId" element={<StepEditorPage />} />
          <Route path="events/:eventId/live" element={<LiveControlPage />} />
        </Routes>
      </AdminGuard>
    </main>
  );
}
