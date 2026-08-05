import { useState } from "react";
import { Link } from "react-router-dom";
import { LuLoaderCircle } from "react-icons/lu";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import { AuthShell } from "./AuthShell";
export function Login() {
  const {
    login
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "No pudimos iniciar sesión");
    } finally {
      setLoading(false);
    }
  }
  return <AuthShell title="Bienvenido de nuevo" subtitle="Ingresá para ver tu presupuesto y tus metas.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="vos@email.com" />
        </div>
        <div>
          <label className="label">Contraseña</label>
          <input className="input" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary mt-2 w-full" type="submit" disabled={loading}>
          {loading && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
          Ingresar
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        ¿No tenés cuenta?{" "}
        <Link to="/registro" className="font-medium text-brand-600 hover:underline">
          Registrate
        </Link>
      </p>
    </AuthShell>;
}
