import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Watchlist } from './pages/Watchlist';
import { Screener } from './pages/Screener';
import { DealAnalyzer } from './pages/DealAnalyzer';
import { Portfolio } from './pages/Portfolio';
import { Compare } from './pages/Compare';
import { DistressRadar } from './pages/DistressRadar';
import { Financials } from './pages/Financials';
import { MagicFormula } from './pages/MagicFormula';
import { PrivateMarkets } from './pages/PrivateMarkets';
import { Rules } from './pages/Rules';
import { Calculator } from './pages/Calculator';
import { Predictions } from './pages/Predictions';
import { StakeholderAnalysis } from './pages/StakeholderAnalysis';

export function App() {
  useEffect(() => {
    window.dhando?.init().catch(console.error);
  }, []);

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/screener" element={<Screener />} />
          <Route path="/deal-analyzer" element={<DealAnalyzer />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/distress" element={<DistressRadar />} />
          <Route path="/financials" element={<Financials />} />
          <Route path="/financials/:investmentId" element={<Financials />} />
          <Route path="/magic-formula" element={<MagicFormula />} />
          <Route path="/calculator" element={<Calculator />} />
          <Route path="/predictions" element={<Predictions />} />
          <Route path="/stakeholders" element={<StakeholderAnalysis />} />
          <Route path="/private-markets" element={<PrivateMarkets />} />
          <Route path="/rules" element={<Rules />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
