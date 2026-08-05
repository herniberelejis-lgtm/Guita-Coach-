import { useState } from "react";
import { Link } from "react-router-dom";
import { LuLoaderCircle } from "react-icons/lu";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import { AuthShell } from "./AuthShell";
export function Register() {
  const {
    register
  } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(name, email, password);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "No pudimos crear tu cuenta");
    } finally {
      setLoading(false);
    }
  }
  return <AuthShell title="Creá tu cuenta" subtitle="Empezá a ordenar tus finanzas en un par de minutos.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label className="label">Nombre</label>
          <input className="input" required value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="vos@email.com" />
        </div>
        <div>
          <label className="label">Contraseña</label>
          <input className="input" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary mt-2 w-full" type="submit" disabled={loading}>
          {loading && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
          Crear cuenta
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        ¿Ya tenés cuenta?{" "}
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          Ingresá
        </Link>
      </p>
    </AuthShell>;
}
