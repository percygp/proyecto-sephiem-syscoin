# Sephiem — Plataforma Web3 de Gestión Clínica

Plataforma de gestión clínica con IA conversacional, pagos Web3 y comunicación contextual entre paciente, médicos y asistentes de salud. React 19 + Convex + Privy + Syscoin.

## Stack

- **Frontend:** React 19 + TypeScript + Vite + TailwindCSS v4
- **Backend:** Convex (TypeScript serverless, realtime)
- **Auth:** Privy (Custom JWT) + MetaMask wallet verification
- **Web3:** MetaMask + Syscoin (pagos on-chain)
- **IA:** Hermes Agent (GPT-4o mini) — checkins diarios, análisis contextual

## Módulos del Backend

| Módulo | Descripción |
|---|---|
| `convex/patients/` | Registro, perfiles, historial clínico |
| `convex/doctors/` | Gestión de médicos, recetas, planes |
| `convex/appointments/` | Agendamiento de citas |
| `convex/messages/` | Mensajería contextual con Hermes |
| `convex/ai/` | Hermes Agent — checkins, contexto, respuestas |
| `convex/wa/` | Canal WhatsApp (Twilio) |
| `convex/maintenance/` | Alertas operativas (Telegram/webhook) |
| `convex/audit/` | Auditoría cerrada con retención |
| `convex/auth/` | Wallet nonce + verificación MetaMask |
| `convex/lib/` | Utilidades RBAC, paginación, validación |
| `convex/inventory/` | Inventario de planes de salud |
| `convex/invoices/` | Facturación on-chain |
| `convex/subscriptions/` | Suscripciones y renovaciones |

## Inicio

```bash
npm install
npm run dev       # frontend Vite + Convex dev server
```

## Variables de Entorno (Convex)

```bash
npx convex env set OPENAI_API_KEY      sk-...
npx convex env set TWILIO_ACCOUNT_SID  ...
npx convex env set TWILIO_AUTH_TOKEN   ...
npx convex env set TWILIO_WHATSAPP_FROM ...
```

## Entornos

| Entorno  | Convex                | URL frontend                          |
|----------|-----------------------|---------------------------------------|
| Staging  | proyecto `sephiem-83362` (`exciting-dragon-400`) | Railway `sephiem-staging` *(pendiente)* |
| Prod     | *(pendiente)*         | *(pendiente)*                         |

Despliegue a staging: ver [`docs/deployment-staging.md`](docs/deployment-staging.md).
Flujo de ramas: `feature/* → staging → main`.

## Enlaces

- [Convex Docs](https://docs.convex.dev)
- [Privy Docs](https://docs.privy.io)
- [Syscoin Docs](https://syscoin.org)
