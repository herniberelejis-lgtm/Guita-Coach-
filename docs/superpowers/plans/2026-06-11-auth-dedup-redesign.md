# Plan 2026-06-11 — Auth multi-usuario, filtros de duplicados/transferencias, rediseño

## Objetivo
Dejar la app lista para una prueba de mercado: login normal (email+password),
datos limpios (sin transferencias internas ni duplicados inflando totales),
UI visual e intuitiva, y un camino documentado para conexiones bancarias.

## Fases
1. **Auth**: tabla `sessions`, `users.email/password_hash`, endpoints
   register/login/logout/me, cookie HttpOnly, dependency `get_current_user`,
   migración de todos los routers fuera de `user_id=1`. Demo mode sigue
   funcionando (auto-usuario 1).
2. **Filtros**: `services/dedup.py` — duplicados cross-source (monto + fecha ±1
   día + merchant similar) y transferencias internas (par income/expense mismo
   monto, fecha cercana). Columnas `is_duplicate`, `is_internal_transfer`.
   Presupuesto e insights las excluyen.
3. **Rediseño**: pantalla auth, dashboard con donut de gastos + barras de
   histórico, campana de notificaciones, pulido CSS.
4. **Docs**: `docs/integraciones-bancarias.md` (Belvo/MP/CSV/Gmail) y
   `docs/deploy.md` (Railway/Render).
5. **Tests**: auth + dedup. Baseline previo: 21 pass / 2 fail preexistentes
   (test_mp_income).

## Fuera de alcance (esta sesión)
- Integración real con Belvo (requiere cuenta y credenciales).
- Cifrado de tokens en DB (anotado como pendiente crítico pre-producción).
- Push notifications nativas (se usa centro de notificaciones in-app).
