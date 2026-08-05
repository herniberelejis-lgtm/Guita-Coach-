export function AuthShell({
  title,
  subtitle,
  children
}) {
  return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-ink-50 to-ink-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">
            G
          </div>
          <h1 className="text-xl font-semibold text-ink-900">Guita Coach</h1>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          <p className="mb-6 mt-1 text-sm text-ink-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>;
}
