import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { LuLayoutDashboard, LuReceipt, LuChartLine, LuTarget, LuWallet, LuMessageCircle, LuGraduationCap, LuSettings, LuLogOut } from "react-icons/lu";
import { useAuth } from "../context/AuthContext";
const NAV_ITEMS = [{
  to: "/",
  label: "Dashboard",
  icon: LuLayoutDashboard
}, {
  to: "/transacciones",
  label: "Transacciones",
  icon: LuReceipt
}, {
  to: "/insights",
  label: "Insights",
  icon: LuChartLine
}, {
  to: "/metas",
  label: "Metas",
  icon: LuTarget
}, {
  to: "/inversiones",
  label: "Inversiones",
  icon: LuWallet
}, {
  to: "/chat",
  label: "Asesor IA",
  icon: LuMessageCircle
}, {
  to: "/academy",
  label: "Academy",
  icon: LuGraduationCap
}, {
  to: "/configuracion",
  label: "Configuración",
  icon: LuSettings
}];
export function Layout() {
  const {
    user,
    logout
  } = useAuth();
  return <div className="flex min-h-screen bg-ink-50">
      <aside className="hidden w-64 flex-col border-r border-ink-100 bg-white px-4 py-6 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">
            G
          </div>
          <div>
            <div className="text-sm font-semibold text-ink-900">Guita Coach</div>
            <div className="text-xs text-ink-400">Asesor financiero AR</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map(({
          to,
          label,
          icon: Icon
        }) => <NavLink key={to} to={to} end={to === "/"} className={({
          isActive
        }) => clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", isActive ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900")}>
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>)}
        </nav>

        <div className="mt-6 border-t border-ink-100 pt-4">
          <div className="mb-3 flex items-center gap-2 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-sm font-semibold text-ink-600">
              {(user?.name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="truncate text-sm font-medium text-ink-800">{user?.name}</div>
          </div>
          <button onClick={() => logout()} className="btn-ghost w-full justify-start gap-3 px-3">
            <LuLogOut className="h-[18px] w-[18px]" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-100 bg-white px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              G
            </div>
            <span className="text-sm font-semibold">Guita Coach</span>
          </div>
          <button onClick={() => logout()} className="text-ink-500">
            <LuLogOut className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>

        <nav className="sticky bottom-0 z-10 flex justify-between border-t border-ink-100 bg-white px-2 py-2 md:hidden">
          {NAV_ITEMS.slice(0, 5).map(({
          to,
          icon: Icon
        }) => <NavLink key={to} to={to} end={to === "/"} className={({
          isActive
        }) => clsx("flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[11px]", isActive ? "text-brand-700" : "text-ink-400")}>
              <Icon className="h-5 w-5" />
            </NavLink>)}
        </nav>
      </div>
    </div>;
}
