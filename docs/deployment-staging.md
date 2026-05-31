# Despliegue a Staging (VAL-45 / [B1])

Entorno de staging **totalmente separado de producción** (datos, deployments,
credenciales). Regla dura: **sin PHI real en staging** (ver VAL-49, datos
sintéticos).

## Arquitectura del entorno

| Capa        | Producción                    | Staging                                       |
|-------------|-------------------------------|-----------------------------------------------|
| Backend     | Convex `sephiem-9b5fb` (prod) | Convex `sephiem-staging` (proyecto separado)  |
| Frontend    | Railway (prod)                | Railway service `sephiem-staging`             |
| Rama deploy | `main`                        | `staging`                                     |
| Auth        | Privy app prod                | Privy app staging                             |

El backend corre en Convex Cloud (serverless); Railway solo sirve el frontend
estático (build de Vite) apuntando al `VITE_CONVEX_URL` de staging.

---

## 1. Rama `staging`

`staging` ya existe localmente. Flujo de ramas (alineado con VAL-48 / [B4]):

```
feature/SEP-xxx  ──PR──▶  staging  ──PR validado──▶  main
```

- `staging`: destino de deploy a staging. Solo merge vía PR con CI + CodeRabbit + 1 approval.
- `main`: solo acepta merges desde `staging`.

Tras crear el remoto en GitHub:

```bash
git remote add origin git@github.com:<org>/sephiem.git
git push -u origin main
git push -u origin staging
```

> Pendiente del usuario: crear el repositorio remoto (gh CLI no está instalada
> en este entorno). Branch protection se configura en VAL-48.

---

## 2. Convex staging (proyecto separado)

Requiere login interactivo. Ejecutar localmente:

```bash
# 1. Autenticarse y crear/seleccionar el deployment de staging
npx convex login
npx convex dev --once --configure new
#   nombre sugerido del proyecto: sephiem-staging

# 2. Volcar los valores resultantes a .env.staging
#    -> VITE_CONVEX_URL y CONVEX_DEPLOYMENT
```

Para deploys no interactivos (CI / Railway) generar un **deploy key** en
Convex Dashboard → Project `sephiem-staging` → Settings → Deploy Keys, y
exportarlo como `CONVEX_DEPLOY_KEY`. Deploy del backend:

```bash
CONVEX_DEPLOY_KEY=<key> npx convex deploy
```

Variables de backend en staging (Convex Dashboard → Settings → Environment
Variables): `JWKS`, `JWT_PRIVATE_KEY` (claves ES256 de staging, distintas de
prod).

---

## 3. Railway staging (frontend)

Requiere cuenta Railway. Crear un service nuevo `sephiem-staging`:

- **Source**: repo GitHub, rama `staging` (auto-deploy on push).
- **Build command**: `npm ci && npm run build`
- **Serve**: servir `dist/` como estático (Railway static, o `npx serve dist`).
- **Variables de entorno** (Railway → Variables):
  - `VITE_CONVEX_URL` = URL del deployment Convex de staging
  - `VITE_PRIVY_APP_ID` = app id Privy de staging
  - `CONVEX_DEPLOY_KEY` = deploy key de staging (si Railway hace `convex deploy`)

URL resultante: `https://sephiem-staging.up.railway.app` (o dominio custom).

---

## 4. Variables de entorno

Plantilla en [`.env.staging.example`](../.env.staging.example). Copiar a
`.env.staging` (gitignored) para builds locales contra staging:

```bash
cp .env.staging.example .env.staging   # rellenar valores
```

| Variable             | Dónde se usa            | Origen                          |
|----------------------|-------------------------|---------------------------------|
| `VITE_CONVEX_URL`    | Frontend build          | Convex staging deployment       |
| `CONVEX_DEPLOYMENT`  | `convex dev` local      | Convex staging                  |
| `CONVEX_DEPLOY_KEY`  | CI / Railway deploy     | Convex Dashboard (Deploy Keys)  |
| `VITE_PRIVY_APP_ID`  | Frontend auth           | Privy app staging               |
| `JWKS`               | Backend (Convex env)    | Claves ES256 staging            |
| `JWT_PRIVATE_KEY`    | Backend (Convex env)    | Claves ES256 staging            |

---

## 5. Deploy de prueba (verificación)

```bash
# Backend
CONVEX_DEPLOY_KEY=<staging-key> npx convex deploy

# Frontend (local, contra staging)
cp .env.staging.example .env.staging   # con valores reales
npm ci
npm run build
npm run preview                         # smoke local

# Verificar: URL de Railway responde 200 y la app carga contra Convex staging.
```

Criterio de aceptación cumplido cuando: Convex staging operativo, URL Railway
accesible, rama `staging` configurada, variables separadas de prod, deploy de
prueba exitoso (con datos sintéticos de VAL-49).

---

## Estado VAL-45

- [x] Rama `staging` creada (local)
- [x] Plantilla de variables de entorno documentada
- [x] Proceso de despliegue documentado (este archivo)
- [ ] Proyecto Convex `sephiem-staging` creado — requiere `npx convex login`
- [ ] Service Railway staging — requiere cuenta Railway
- [ ] Remoto GitHub + push de ramas — requiere repo remoto
- [ ] Deploy de prueba end-to-end
