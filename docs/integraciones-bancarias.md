# Conexiones bancarias y billeteras — investigación y plan (junio 2026)

## La realidad en Argentina

A diferencia de Europa (PSD2) o Brasil, **Argentina no tiene open banking
regulado**: los bancos son dueños del dato y no están obligados a exponer APIs
a terceros. No existe una API oficial de Galicia, Santander, BBVA, Ualá o
Brubank que un tercero pueda usar con el consentimiento del usuario. Eso define
la estrategia: agregadores + las APIs que sí existen + fallbacks.

## Opciones evaluadas

| Vía | Estado | Cobertura | Costo | Veredicto |
|-----|--------|-----------|-------|-----------|
| **Mercado Pago OAuth** | ✅ Implementado | MP (la billetera dominante) | Gratis | Mantener |
| **Gmail (comprobantes)** | ✅ Implementado | Cualquier banco que mande email | Gratis | Mantener; es el "agregador de pobres" más efectivo |
| **Prometeo** (prometeoapi.com) | Recomendado a futuro | Bancos AR en modo lectura | Pago, plan dev gratuito | La opción más concreta para bancos argentinos |
| **Belvo** | Evaluado | Fuerte en MX/BR/CO, AR limitado | Pago | Esperar; revisar cobertura AR antes de integrar |
| **MODO** | Evaluado | Vinculación de cuentas/pagos | B2B, requiere acuerdo | No apto para un MVP indie |
| **Import CSV/Excel** | ⬜ Pendiente (alta prioridad) | Todos los bancos (export manual) | Gratis | Implementar: cubre el 100% de bancos hoy |
| **APIs directas de bancos** | ❌ No existen públicas | — | — | Descartado |

## Estrategia recomendada para la prueba de mercado

1. **Hoy (sin costo):** MP OAuth + Gmail + carga manual + **import CSV**
   (el usuario baja el resumen del home banking y lo sube; es el estándar de
   facto de las apps de finanzas personales en AR).
2. **Si la prueba valida demanda:** integrar **Prometeo** para lectura directa
   de cuentas bancarias argentinas (sandbox gratuito para desarrollo).
3. **Largo plazo:** monitorear la agenda de finanzas abiertas del BCRA; si se
   regula, los agregadores locales van a explotar en cobertura.

## Qué ya resuelve la app (implementado en esta iteración)

- **Dedup cross-source** (`app/services/dedup.py`): si el mismo gasto entra por
  carga manual y después por Gmail o MP (mismo monto, ±1 día, merchant
  compatible), el segundo se marca `is_duplicate` y no suma a los totales.
- **Transferencias entre cuentas propias**: pares ingreso/egreso del mismo
  monto con fecha cercana y señal de transferencia se marcan
  `is_internal_transfer` y se excluyen de presupuesto, insights y chat.
- Ambos casos quedan visibles en la tabla de movimientos con badge propio
  (auditable, no se borra nada).

## Requisitos para activar lo ya implementado

- **Gmail**: proyecto en Google Cloud + OAuth consent screen verificado
  (para publicar a usuarios reales Google exige verificación de la app si pedís
  scope de lectura de Gmail — proceso de semanas, planificarlo ya).
- **Mercado Pago**: app en developers.mercadopago.com con redirect URI de
  producción.

Fuentes: [Prometeo](https://prometeoapi.com/en) ·
[Belvo](https://belvo.com/reports/) ·
[MODO Conexiones](https://www.modo.com.ar/conexiones) ·
[Guía APIs bancarias](https://blog.wealthreader.com/2026/02/18/api-para-leer-datos-bancarios-la-guia-completa-para-conectar-con-bancos/)
