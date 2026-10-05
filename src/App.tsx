import { useEffect, useState } from 'react';
import { AboutTab } from './components/AboutTab';
import { ExportTab } from './components/ExportTab';
import { LogTab } from './components/LogTab';
import { Overview } from './components/Overview';
import { WhoopTab } from './components/WhoopTab';
import { useModel } from './useModel';
import { handleRedirectIfPresent } from './whoop/client';

type Tab = 'overview' | 'log' | 'whoop' | 'export' | 'about';

export default function App() {
  const m = useModel();
  const [tab, setTab] = useState<Tab>(() => (location.search.includes('code=') || location.search.includes('error=') ? 'whoop' : 'overview'));
  const [oauthMsg, setOauthMsg] = useState<string | null>(null);

  useEffect(() => {
    handleRedirectIfPresent().then((r) => {
      if (r.handled) setOauthMsg(r.error ?? 'WHOOP connected. Click "Sync last 60 days".');
    });
  }, []);

  return (
    <div className="app">
      <header className="top">
        <h1>Circadian phase</h1>
        <small>Local-only. Nothing leaves this browser unless you connect WHOOP.</small>
      </header>
      <div className="banner">
        <strong>Not a medical device.</strong> This is a personal-interest tool. Every number is an estimate from population-average relationships, shown with its confidence and
        assumptions, and is never a measurement. Delayed sleep phase disorder is diagnosed by a clinician.
      </div>
      <nav className="tabs">
        {(
          [
            ['overview', 'Overview'],
            ['log', 'Log'],
            ['whoop', 'WHOOP'],
            ['export', 'Export / summary'],
            ['about', 'Method'],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>
      {m.loading ? (
        <p className="muted">Loading…</p>
      ) : tab === 'overview' ? (
        <Overview m={m} />
      ) : tab === 'log' ? (
        <LogTab m={m} />
      ) : tab === 'whoop' ? (
        <WhoopTab m={m} oauthMessage={oauthMsg} />
      ) : tab === 'export' ? (
        <ExportTab m={m} />
      ) : (
        <AboutTab />
      )}
    </div>
  );
}
