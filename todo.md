# todo.md

## Hitos de alto nivel

- [x] Hito 1: Fundaciones del monorepo
- [x] Hito 2: Persistencia y auth
- [x] Hito 3: Ingesta de datos
- [x] Hito 4: Corridas y pipeline async
- [x] Hito 5: Evaluación LLM
- [x] Hito 6: Lectura de resultados
- [x] Hito 7: Compartición y exportación
- [x] Hito 8: Retención, re-evaluación y hardening

---

## Tareas granulares

### Hito 1: Fundaciones del monorepo
- [x] Crear monorepo pnpm con `apps/web`, `apps/api`, `packages/shared`
- [x] Configurar TypeScript base
- [x] Configurar lint y format
- [x] Configurar Vitest
- [x] Configurar Playwright
- [x] Crear endpoint `/health`
- [x] Crear página inicial del sistema
- [x] Agregar Docker Compose con Postgres y Redis
- [x] Agregar `.env.example`

### Hito 2: Persistencia y auth
- [x] Configurar Prisma en api
- [x] Crear migración inicial mínima
- [x] Crear seed de admin
- [x] Implementar auth por correo y contraseña
- [x] Implementar endpoint `me`
- [x] Crear pantallas de login
- [x] Proteger rutas privadas
- [x] Modelar `InviteToken`
- [x] Implementar invitación
- [x] Implementar activación de cuenta
- [x] Implementar administración de usuarios
- [x] Implementar cambio de rol
- [x] Implementar desactivación
- [x] Implementar reset de contraseña

### Hito 3: Ingesta de datos
- [x] Modelar `Catalog`, `Conversation`, `Message`
- [x] Implementar upload de catálogo
- [x] Parsear fecha desde nombre de archivo
- [x] Persistir metadata de catálogo
- [x] Definir contrato estricto de conversaciones
- [x] Implementar parser y normalizador
- [x] Manejar lotes mixtos válidos/inválidos
- [x] Crear corrida desde archivo JSON
- [x] Persistir conversaciones válidas
- [x] Persistir conversaciones no evaluadas
- [x] Generar nombre automático de corrida

### Hito 4: Corridas y pipeline async
- [x] Implementar historial básico de corridas
- [x] Integrar BullMQ
- [x] Crear cola de evaluation jobs
- [x] Encolar job por conversación válida
- [x] Implementar progreso agregado
- [x] Implementar lanzamiento manual de corrida
- [x] Implementar resolución de catálogo por fecha
- [x] Implementar cancelación sin publicación

### Hito 5: Evaluación LLM
- [x] Definir interfaces de jueces
- [x] Crear fake judges
- [x] Versionar prompts/rúbricas (PromptLoader + SHA-256)
- [x] Implementar Integridad
- [x] Persistir findings y severidad
- [x] Implementar Calidad Conversacional
- [x] Calcular sub-scores
- [x] Implementar Patrones/Escenarios
- [x] Persistir patrones conocidos y emergentes
- [x] Implementar juez Consolidador (4to paso LLM)
- [x] Consolidar score final por conversación
- [x] Consolidar estado final por conversación
- [x] Consolidar agregados de corrida
- [x] Crear snapshot inmutable

### Hito 6: Lectura de resultados
- [x] Implementar endpoint de última corrida
- [x] Construir dashboard principal
- [x] Construir historial completo
- [x] Construir detalle de corrida
- [x] Construir tabla de conversaciones con filtros
- [x] Construir detalle de conversación tipo WhatsApp
- [x] Mostrar evaluación por criterio

### Hito 7: Compartición y exportación
- [x] Modelar `ShareRecord`
- [x] Compartir corrida con Yalo
- [x] Compartir conversación con Yalo
- [x] Aplicar permisos para Yalo
- [x] Crear vista de compartidos con Yalo
- [x] Modelar `ExportJob`
- [x] Implementar exportación JSON con anonimización de teléfonos

### Hito 8: Retención, re-evaluación y hardening
- [x] Mostrar fecha de expiración
- [x] Implementar cleanup automático a 3 meses
- [x] Implementar filtros de re-evaluación
- [x] Crear corrida derivada
- [x] Conectar adaptadores Gemini (con fallback a fake judges)
- [x] Agregar logs estructurados (pino)
- [x] Agregar correlation ids
- [x] Agregar rate limiting (throttler)
- [x] Agregar helmet + input validation
- [x] Escribir E2E con Playwright

---

## Criterios de listo por fase

### Fundaciones
- [x] apps levantan localmente
- [x] tests smoke pasan
- [x] Docker Compose funciona

### Auth
- [x] login funciona
- [x] admin puede invitar
- [x] permisos básicos aplican

### Ingesta
- [x] catálogos cargan bien
- [x] parser acepta lotes mixtos
- [x] corrida se crea correctamente

### Pipeline
- [x] se encola un job por conversación
- [x] progreso agregado visible
- [x] cancelación no publica resultados

### Evaluación
- [x] Integridad, Calidad y Patrones persisten resultados
- [x] score final se consolida via Consolidador
- [x] snapshot queda guardado

### Lectura
- [x] dashboard muestra última corrida
- [x] historial es usable
- [x] detalle de conversación con WhatsApp UI + eval panel

### Compartición y exportación
- [x] Yalo solo ve compartido
- [x] export JSON descarga corrida completa con anonimización

### Cierre MVP
- [x] expiración visible
- [x] cleanup automático activo
- [x] re-evaluación genera corrida derivada
- [x] E2E críticos pasan
- [x] 248 tests passing
