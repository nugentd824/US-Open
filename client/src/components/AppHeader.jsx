import { Link } from 'react-router-dom';

// Top app bar. `right` renders extra controls (e.g. live connection dot).
export default function AppHeader({ right }) {
  return (
    <header className="sticky top-0 z-20 bg-fairway text-white shadow-md">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="text-xl">⛳</span>
          <span>Fairway Fantasy</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">{right}</div>
      </div>
    </header>
  );
}

export function LiveDot({ connected }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium">
      <span
        className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-300 animate-pulse' : 'bg-slate-300'}`}
      />
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}
