import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken, setToken } from './api';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { ProjectList } from './components/ProjectList';
import { ProjectBoard } from './components/ProjectBoard';
import { ProjectSettings } from './components/ProjectSettings';
import { KnowledgeBase } from './components/KnowledgeBase';
import { Resources } from './components/Resources';
import { AgentsDashboard } from './components/AgentsDashboard';
import { GanttView } from './components/GanttView';
import { ScheduleCalendar } from './components/ScheduleCalendar';
import { Reports } from './components/Reports';
import { EmailTriage } from './components/EmailTriage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = getToken();
  if (!token) {
    return <Login onSuccess={setToken} />;
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RequireAuth><ProjectList /></RequireAuth>} />
        <Route path="/project/:projectId" element={<RequireAuth><ProjectBoard /></RequireAuth>} />
        <Route path="/project/:projectId/gantt" element={<RequireAuth><GanttView /></RequireAuth>} />
        <Route path="/project/:projectId/settings" element={<RequireAuth><ProjectSettings /></RequireAuth>} />
        <Route path="/knowledge" element={<RequireAuth><KnowledgeBase /></RequireAuth>} />
        <Route path="/resources" element={<RequireAuth><Resources /></RequireAuth>} />
        <Route path="/agents" element={<RequireAuth><AgentsDashboard /></RequireAuth>} />
        <Route path="/schedule" element={<RequireAuth><ScheduleCalendar /></RequireAuth>} />
        <Route path="/reports" element={<RequireAuth><Reports /></RequireAuth>} />
        <Route path="/email-triage" element={<RequireAuth><EmailTriage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
