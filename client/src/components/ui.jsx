// Small styled primitives so screens stay consistent and terse.

export function Button({ variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none';
  const variants = {
    primary: 'bg-fairway text-white hover:bg-green-800 shadow-sm',
    secondary: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({ className = '', ...props }) {
  return (
    <div className={`rounded-2xl bg-white shadow-sm border border-slate-100 ${className}`} {...props} />
  );
}

export function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-fairway focus:ring-2 focus:ring-green-100 ${className}`}
      {...props}
    />
  );
}

export function Label({ children }) {
  return <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{children}</label>;
}

export function Pill({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-fairway" />
    </div>
  );
}

export function ErrorBanner({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm text-rose-700">
      {children}
    </div>
  );
}
