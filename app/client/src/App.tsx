import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { QueuePage } from '@/pages/QueuePage';
import { DraftsPage } from '@/pages/DraftsPage';
import { CaseFormPage } from '@/pages/CaseFormPage';
import { GettingStartedPage } from '@/pages/GettingStartedPage';

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <QueuePage /> },
      { path: '/drafts', element: <DraftsPage /> },
      { path: '/getting-started', element: <GettingStartedPage /> },
      { path: '/cases/:caseId', element: <CaseFormPage /> },
      { path: '*', element: <QueuePage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
