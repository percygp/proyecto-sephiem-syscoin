## Objetivo del Proyecto

Plataforma Web3 para gestión clínica: datos médicos, automatización con IA (Hermes Agent) y canal contextual entre paciente, agentes y servicios de salud. UI dinámica y responsiva. Stack: React + Convex + auth Web3 (MetaMask).

---

# Response Compression Policy

## Core Rules

* concise technical responses
* preserve semantic precision
* avoid conversational filler
* prioritize blockers and risks
* no redundant explanations
* short actionable outputs
* architecture-first reasoning

## Output Rules

Use structured outputs whenever possible:

STATUS:
BLOCKERS:
MAJORS:
MINORS:
ACTION:

## Token Efficiency

* minimize repeated context
* avoid verbose markdown
* avoid decorative formatting
* compress tool usage summaries
* prefer bullets over paragraphs

## Restrictions

* no unnecessary examples
* no motivational language
* no conversational padding
* no speculative assumptions

---

# Reglas Operativas Globales

## Gestión de Tareas (Linear)

Todas las tareas, bugs, mejoras y planificación técnica se gestionan en Linear.

### Reglas obligatorias

- Antes de desarrollar: consultar issues asignados y backlog en Linear.
- No desarrollar fuera de Linear.
- Todo bug: issue antes de corregir.
- Todo refactor o mejora técnica: issue antes de ejecutar.
- Al finalizar: actualizar estado, notas técnicas y marcar `Done`.

### Regla automática de Linear

- Registrar en Linear toda tarea antes de ejecutarla.
- Al terminar: actualizar estado en Linear.
- Bug o mejora detectada en trabajo: crear issue de inmediato.
- No trabajar sin issue en Linear.

---

# Flujo de Trabajo

## 1. Consulta Inicial

- Revisar backlog e issues asignados en Linear.
- Priorizar: Critical → High → Medium → Low.

## 2. Selección de Tarea

- Tomar el issue de mayor prioridad disponible.
- Validar dependencias técnicas antes de iniciar.

## 3. Creación de Rama

Formato obligatorio:

```bash
feature/[linear-issue-id]-descripcion-corta
```

Ejemplo: `feature/SEP-142-auth-metamask`

Para bugs:

```bash
fix/[linear-issue-id]-descripcion-corta
```

---

# Estándares de Desarrollo

## Reglas Generales

- Arquitectura modular.
- Sin lógica duplicada.
- SOLID.
- TypeScript estricto; evitar `any` salvo justificación explícita.
- Separar: UI, negocio, estado, datos, autenticación.

## Stack Tecnológico

**Frontend:** React 19, TypeScript, Vite, TailwindCSS v4

## UI / Experiencia Web

- Sitio **dinámico**: contenido y estado reactivos (Convex realtime, datos en vivo).
- Sitio **responsivo**: mobile-first; layouts fluidos; breakpoints coherentes (sm/md/lg/xl).
- Probar en móvil, tablet y desktop antes de cerrar tarea UI.
- Sin scroll horizontal involuntario; touch targets accesibles en móvil.

**Backend:** Convex (TypeScript serverless), realtime Convex

**Autenticación:** Privy (Custom JWT) + MetaMask wallet verification

**Web3:** wallet MetaMask, identidad Web3, firma de mensajes cuando aplique

**IA / Agentes:** Hermes Agent, automatización conversacional, sesiones IA contextuales

## Convenciones de Código

**TypeScript:** `strict: true`; interfaces para entidades; validar inputs críticos.

**React:** componentes pequeños; sin monolitos; hooks desacoplados; estado global mínimo; UI responsiva con Tailwind (`flex`, `grid`, unidades relativas).

**Convex:** separar queries, mutations, actions; permisos en backend; no confiar solo en validación frontend.

## Seguridad

- No exponer secrets ni hardcodear API keys.
- Variables de entorno para credenciales.
- Auth y autorización en backend.
- Sanitizar inputs críticos.
- Validar firmas Web3.

## Calidad de Código

Antes de cerrar tarea:

```bash
npm run lint
npm run typecheck
npm run build
```

Si existe testing: `npm run test`

## Commits

Formato: `type(scope): descripcion`

Ejemplos:

- `feat(auth): add metamask login`
- `fix(convex): resolve realtime sync issue`
- `refactor(ui): simplify dashboard layout`

## Documentación

Funcionalidad relevante: descripción técnica, flujo de datos, dependencias, riesgos, seguridad.

## Reglas de IA

- Precisión técnica; sin cambios innecesarios.
- Consistencia arquitectónica.
- Pedir contexto faltante antes de implementar.
- No asumir estructuras inexistentes.
- Analizar impacto antes de tocar archivos críticos.

## Objetivo de Arquitectura

Escalable, modular, realtime, Web3, compatible con IA, segura y mantenible.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
