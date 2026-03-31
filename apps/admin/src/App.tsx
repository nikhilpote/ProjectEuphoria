import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { ShowsPage } from './pages/ShowsPage';
import { GamesPage } from './pages/GamesPage';
import { LiveOpsPage } from './pages/LiveOpsPage';
import { ConfigPage } from './pages/ConfigPage';
import { EarnRatesPage } from './pages/EarnRatesPage';
import { RewardRulesPage } from './pages/RewardRulesPage';
import { SpotDiffEditorPage } from './pages/SpotDiffEditorPage';
import { PlayClipsPage } from './pages/PlayClipsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/shows" element={<ShowsPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/liveops" element={<LiveOpsPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/earn-rates" element={<EarnRatesPage />} />
          <Route path="/reward-rules" element={<RewardRulesPage />} />
          <Route path="/spot-diff-editor" element={<SpotDiffEditorPage />} />
          <Route path="/playclips" element={<PlayClipsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
