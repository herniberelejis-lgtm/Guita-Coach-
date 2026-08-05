import { Link } from "react-router-dom";
export function NotFound() {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-50 px-4 text-center">
      <div className="text-5xl font-bold text-ink-300">404</div>
      <p className="text-ink-600">Esta página no existe.</p>
      <Link to="/" className="btn-primary">
        Volver al dashboard
      </Link>
    </div>;
}
