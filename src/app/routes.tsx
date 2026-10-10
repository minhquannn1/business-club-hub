import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './Shell';
import { Overview } from './Overview';
import { ProjectsPage } from './Projects';
import { ProjectDetail } from './ProjectDetail';
import { TasksPage } from './tasks';
import { MeetingPage, MeetingsPage } from './Meetings';
import { FinancePage } from './Finance';
import { MembersPage } from './Members';
import { ActivityPage } from './Activity';
import { WebsitePage } from './Website';
import { Login } from './Login';
import { ImportPage } from './planning';

/** The signed-in workspace, loaded as its own chunk so the public site stays light. */
export default function WorkspaceRoutes({ login }: { login?: boolean }) {
  if (login) return <Login />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="meetings/:id" element={<MeetingPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="finance/:sheetId" element={<FinancePage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="website" element={<WebsitePage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
    </Routes>
  );
}
