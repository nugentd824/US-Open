import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import Home from './pages/Home.jsx';
import JoinPage from './pages/JoinPage.jsx';
import LeaguePage from './pages/LeaguePage.jsx';

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/join/:code', element: <JoinPage /> },
  { path: '/league/:id', element: <LeaguePage /> },
  { path: '*', element: <Home /> },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
