# prompt_plan.md

## 1. Contexto del proyecto

Vamos a construir un sistema web para evaluar conversaciones reales terminadas del agente de ventas de Yalo para Alkosto, usando:

- **Frontend:** Next.js + TypeScript + Tailwind
- **Backend:** NestJS + TypeScript
- **Base de datos:** PostgreSQL en Cloud SQL
- **ORM:** Prisma
- **Jobs asíncronos:** BullMQ + Redis
- **Storage:** Google Cloud Storage
- **Infra cloud:** Google Cloud Run + Cloud SQL + Memorystore + GCS
- **Testing:** Vitest + Playwright
- **Autenticación:** login propio con correo y contraseña
- **LLM as judge:** capa abstraída por proveedor

El objetivo es llegar a un MVP funcional que permita:

- autenticación y autorización básica
- carga manual de archivo JSON con múltiples conversaciones
- carga de catálogos diarios
- creación de corridas
- evaluación asíncrona por conversación
- dashboard de última corrida
- historial de corridas
- detalle de conversación con UI tipo WhatsApp + panel de evaluación
- compartición explícita con Yalo
- exportación JSON por corrida completa
- retención de 3 meses

---

## 2. Supuestos de implementación

### Supuestos funcionales
- El archivo de conversaciones sigue una estructura fija.
- Cada conversación trae `session_id`, `date` y `messages`.
- Cada mensaje trae `message_id`, `role`, `content/text`, `timestamp`.
- Los roles de mensaje son solo `user` y `assistant`.
- Los catálogos diarios se cargan por separado y su fecha se infiere del nombre de archivo.
- La evaluación se hace por conversación completa.
- El score principal sale de `Calidad Conversacional`.
- `Integridad` actúa como gate contextual.
- `Patrones/Escenarios` es solo analítico en el MVP.

### Supuestos técnicos
- Monorepo con apps separadas para frontend y backend.
- Prisma centralizado.
- Redis disponible en dev por Docker Compose.
- GCS abstraído detrás de un puerto de almacenamiento.
- LLM abstraído detrás de una interfaz.
- Jobs procesados por worker dedicado.
- Se prioriza desarrollo incremental y cobertura de pruebas desde el inicio.

---

## 3. Blueprint técnico paso a paso

## Fase A. Fundaciones del proyecto

### A1. Monorepo y toolchain
Crear la base del proyecto con:

- estructura de monorepo
- app `web` con Next.js
- app `api` con NestJS
- paquete compartido para tipos y contratos
- configuración de lint, format, tsconfig
- Vitest
- Playwright
- Docker Compose para Postgres y Redis

### A2. Convenciones de arquitectura
Definir límites claros:

- `web`: UI y consumo API
- `api`: dominio, aplicación, infraestructura
- `packages/shared`: tipos, esquemas, contratos serializables
- `workers`: procesadores BullMQ dentro del backend o módulo separado según simplicidad del MVP

### A3. Salud del proyecto
Agregar:

- endpoint health en backend
- página mínima en frontend
- tests smoke
- CI local reproducible

---

## Fase B. Modelo de datos y persistencia

### B1. Prisma schema inicial
Modelar entidades principales:

- User
- InviteToken
- Run
- Conversation
- Message
- Catalog
- Evaluation
- Finding
- Pattern
- ShareRecord
- ExportJob

### B2. Estados del sistema
Definir enums:

- roles de usuario
- estados de corrida
- estados de conversación
- severidad de hallazgo
- módulos de evaluación
- tipos de compartición

### B3. Migraciones y seed
Crear:

- migración inicial
- seed de usuario admin
- helpers de conexión y reset para test

---

## Fase C. Autenticación y gestión de usuarios

### C1. Auth base
Implementar:

- login por correo + contraseña
- hash de contraseña
- sesión segura
- guards backend
- páginas protegidas frontend

### C2. Invitaciones
Implementar:

- creación de invitación por admin
- activación inicial por link
- definición de contraseña
- expiración simple del token

### C3. Administración mínima
Implementar UI/API para:

- listar usuarios
- crear usuario
- desactivar usuario
- resetear contraseña
- cambiar rol

---

## Fase D. Catálogos y validación de cargas

### D1. Ingesta de catálogos
Permitir subir archivo de catálogo diario:

- extracción de fecha desde nombre de archivo
- validación básica
- persistencia del catálogo y metadatos
- almacenamiento del artefacto procesado en GCS o DB según convenga

### D2. Contrato de conversaciones
Definir esquema estricto del archivo de conversaciones:

- lote de múltiples conversaciones
- validación por conversación
- mensajes ordenables por timestamp
- normalización de fechas a ISO 8601 Colombia

### D3. Parser y normalizador
Construir parser robusto con salida canónica:

- conversaciones válidas
- conversaciones no evaluables por formato
- motivos de fallo

---

## Fase E. Corridas y pipeline de procesamiento

### E1. Crear corrida
Implementar flujo:

- subir archivo JSON
- validar lote
- crear corrida
- persistir conversaciones parseadas
- dejar lista para ejecución manual

### E2. Lanzar corrida
Implementar:

- trigger manual desde usuario interno
- creación de jobs por conversación
- estado agregado de corrida
- progreso resumido

### E3. Worker
Construir worker BullMQ que procese una conversación en secuencia:

1. resolver catálogo por fecha (coincidencia exacta; sin catálogo → no evaluable)
2. ejecutar Integridad (catálogo completo en contexto, Gemini 1M tokens)
3. ejecutar Calidad Conversacional
4. ejecutar Patrones/Escenarios
5. ejecutar **Consolidador** (cuarto juez LLM: recibe salidas de 2–4, decide score + etiqueta final)
6. generar snapshot inmutable

### E4. Cancelación
Permitir cancelar corrida en progreso:

- detener encolamiento futuro
- invalidar publicación de resultados
- asegurar que no aparezca en historial

---

## Fase F. Capa de evaluación

### F1. Abstracción LLM
Crear puerto de evaluación:

- interfaz de judge (4 jueces: Integridad, Calidad Conversacional, Patrones/Escenarios, **Consolidador**)
- requests estructurados
- responses tipadas
- **proveedor LLM: Gemini 2.0 Flash** (Google Cloud, 1M tokens de contexto). Se envía el catálogo completo en cada llamada sin pre-filtrado. Usar JSON mode de Gemini para respuestas estructuradas. Si la calidad de Flash no es suficiente, escalar a Gemini Pro.
- versionado de prompt/rúbrica: los prompts de cada juez se almacenan como archivos Markdown en `apps/api/prompts/{judge}/system.md` y `user.md` (donde judge = integrity, quality, patterns, **consolidator**). Un servicio `PromptLoader` los carga al iniciar la API (cached), sustituye variables `{{placeholder}}` en el prompt de usuario, y expone el hash SHA-256 (primeros 8 chars) del contenido de cada archivo como `promptVersion` para el snapshot inmutable. Si falta un archivo de prompt al arrancar, la API debe lanzar error (fail fast).

### F2. Judge de Integridad
Implementar evaluación contra:

- transcript
- catálogo del día

Debe producir:

- hallazgos por tipo
- severidad
- explicación breve cuando aplique

### F3. Judge de Calidad Conversacional
Implementar sub-scores:

- Entendimiento de la necesidad
- Calidad de la recomendación
- Fluidez/claridad para WhatsApp

Debe producir:

- score por subcriterio
- score total
- hallazgos automáticos
- explicación breve
- evidencias referenciadas

### F4. Judge de Patrones/Escenarios
Implementar:

- clasificación sobre taxonomía base
- detección de emergentes
- explicación y evidencias

### F5. Juez Consolidador (cuarto paso LLM)
Implementar un cuarto juez LLM que recibe las salidas de los tres jueces anteriores y decide el resultado final:

- recibe: hallazgos de Integridad + sub-scores de Calidad + clasificación de Patrones
- produce: score final 0.0–10.0, etiqueta (`aprobada`/`con hallazgos`/`fallida`), explicación
- si algún juez falló (error/timeout), recibe `null` para ese módulo y produce resultado con nota
- prompt almacenado en `apps/api/prompts/consolidator/system.md` y `user.md`

### F6. Snapshot y cierre
Unificar todo en el modelo de evaluación:

- snapshot inmutable con resultado del consolidador
- estado no evaluable si aplica (conversaciones sin catálogo no pasan por ningún juez)
- masking de teléfonos

---

## Fase G. Lectura de resultados y UX principal

### G1. Dashboard de última corrida
Construir:

- resumen de última corrida
- score agregado
- distribución de estados
- métricas clave
- comparación con corrida inmediatamente anterior

### G2. Historial de corridas
Construir tabla con:

- fecha/hora
- id de corrida
- estado
- total
- evaluadas
- no evaluadas
- score agregado
- fecha de expiración
- compartida con Yalo

### G3. Detalle de corrida
Construir:

- resumen agregado
- listado de conversaciones
- filtros básicos
- acceso al detalle de conversación

### G4. Detalle de conversación
Construir vista 2 paneles:

- izquierda: conversación tipo WhatsApp
- derecha: evaluación por criterio
- navegación desde hallazgo a fragmento

---

## Fase H. Compartición con Yalo

### H1. Modelo de compartición
Implementar compartición a nivel:

- corrida completa
- conversación individual

### H2. Reglas de acceso
Asegurar:

- Yalo solo ve compartido explícitamente
- compartir corrida comparte todas sus conversaciones
- todos los usuarios Yalo ven lo mismo

### H3. Vistas para Yalo
Reusar vistas existentes en modo solo lectura, ocultando acciones no permitidas.

---

## Fase I. Exportación, retención y re-evaluación

### I1. Exportación JSON
Permitir exportar corrida completa con:

- resultados agregados
- configuración usada
- catálogos asociados
- evaluaciones y hallazgos
- transcripts

### I2. Retención y expiración
Implementar:

- fecha de expiración visible
- job de limpieza automática a 3 meses
- eliminación de DB + storage asociado

### I3. Re-evaluación
Permitir tomar subconjunto filtrado de conversaciones y disparar nueva corrida derivada.

---

## Fase J. Endurecimiento

### J1. Observabilidad
Agregar:

- logs estructurados
- correlation ids
- métricas básicas de jobs

### J2. Seguridad
Revisar:

- sesión segura
- control de acceso
- masking de teléfonos
- validación de inputs

### J3. E2E críticos
Cubrir flujos críticos completos con Playwright.

---

## 4. Chunking iterativo

## Primera descomposición en bloques grandes

### Bloque 1
Fundaciones técnicas y monorepo.

### Bloque 2
Modelo de datos y persistencia.

### Bloque 3
Autenticación, usuarios y roles.

### Bloque 4
Carga de catálogos y parser de conversaciones.

### Bloque 5
Creación de corridas y pipeline async.

### Bloque 6
Evaluación LLM y consolidación.

### Bloque 7
Dashboard, historial y detalle.

### Bloque 8
Compartición con Yalo.

### Bloque 9
Exportación, retención y re-evaluación.

### Bloque 10
Endurecimiento y pruebas E2E.

---

## Segunda descomposición en chunks implementables

### Chunk 1. Fundaciones
- monorepo
- apps base
- shared package
- Docker Compose
- CI local
- smoke tests

### Chunk 2. Prisma y DB
- schema inicial
- migración
- seed admin
- repositorios base

### Chunk 3. Auth
- login
- sesiones
- guards
- páginas protegidas

### Chunk 4. Admin usuarios
- invitar
- activar
- desactivar
- resetear
- cambiar rol

### Chunk 5. Catálogos
- upload
- parse fecha archivo
- persistencia
- listado

### Chunk 6. Parser de conversaciones
- contrato JSON
- normalización
- invalidación parcial
- persistencia canónica

### Chunk 7. Corridas
- crear corrida
- subir lote
- listar corridas
- detalle básico

### Chunk 8. Cola y worker
- BullMQ
- jobs por conversación
- estados agregados

### Chunk 9. LLM abstraction
- puerto judge
- mocks de judge
- contrato de resultados

### Chunk 10. Integridad
- judge especializado
- hallazgos
- severidad
- masking teléfonos

### Chunk 11. Calidad conversacional
- sub-scores
- score total
- hallazgos automáticos

### Chunk 12. Patrones
- taxonomía base
- emergentes
- explicación

### Chunk 13. Consolidación
- etiqueta final
- snapshots
- progreso corrida

### Chunk 14. Dashboard e historial
- última corrida
- tabla historial
- comparación previa

### Chunk 15. Detalle de conversación
- UI WhatsApp
- panel evaluación
- highlight de evidencias

### Chunk 16. Compartición Yalo
- compartir corrida
- compartir conversación
- enforcement de permisos

### Chunk 17. Exportación y retención
- export JSON
- expiración visible
- cleanup job

### Chunk 18. Re-evaluación
- filtros
- nueva corrida derivada

### Chunk 19. Hardening
- observabilidad
- seguridad
- tests E2E finales

---

## Tercera descomposición a pasos pequeños y seguros

Esta es la versión final recomendada, ya dimensionada para implementación incremental con TDD y sin saltos grandes.

---

## 5. Secuencia final de implementación

### Paso 1. Crear monorepo y toolchain base
Resultado:
- estructura estable
- apps arrancando
- tests smoke pasando

### Paso 2. Añadir Docker Compose y config local
Resultado:
- Postgres y Redis locales listos
- conexión reproducible

### Paso 3. Crear paquete shared con contratos básicos
Resultado:
- tipos compartidos
- enums mínimos

### Paso 4. Configurar Prisma y migración inicial mínima
Resultado:
- User y Run iniciales
- migración funcional

### Paso 5. Implementar healthcheck backend y shell frontend
Resultado:
- app conectable
- smoke e integración mínima

### Paso 6. Implementar auth básica
Resultado:
- login funcional
- sesión protegida
- pruebas de acceso

### Paso 7. Implementar modelo completo de usuarios e invitaciones
Resultado:
- admin puede invitar
- activación de contraseña

### Paso 8. Implementar administración de usuarios
Resultado:
- listar, cambiar rol, desactivar, resetear

### Paso 9. Extender modelo de datos a catálogos, conversaciones y mensajes
Resultado:
- esquema persistente del dominio principal

### Paso 10. Implementar carga de catálogos
Resultado:
- upload y parse de fecha
- registro persistido

### Paso 11. Implementar contrato estricto de conversaciones
Resultado:
- validación por conversación
- parser canónico testeado

### Paso 12. Implementar creación de corrida con persistencia del lote
Resultado:
- corrida creada
- conversaciones válidas y no evaluadas guardadas

### Paso 13. Implementar historial básico de corridas
Resultado:
- lista operativa desde UI

### Paso 14. Integrar BullMQ y job por conversación
Resultado:
- corrida puede encolar trabajo
- progreso agregado básico

### Paso 15. Crear abstracción LLM con fake provider para tests
Resultado:
- pipeline testeable sin depender de proveedor real

### Paso 16. Implementar resolución catálogo por fecha
Resultado:
- conversación encuentra catálogo o queda no evaluada

### Paso 17. Implementar judge de Integridad
Resultado:
- hallazgos y severidad persistidos

### Paso 18. Implementar judge de Calidad Conversacional
Resultado:
- sub-scores y score principal persistidos

### Paso 19. Implementar judge de Patrones/Escenarios
Resultado:
- patrones conocidos y emergentes persistidos

### Paso 20. Implementar consolidación final por conversación
Resultado:
- score final
- etiqueta final
- snapshot conversación

### Paso 21. Completar consolidación de corrida
Resultado:
- agregados de corrida
- estado completada o parcial

### Paso 22. Implementar dashboard de última corrida
Resultado:
- resumen útil con comparación previa

### Paso 23. Implementar detalle de corrida
Resultado:
- tabla de conversaciones y acceso a detalle

### Paso 24. Implementar vista detallada de conversación
Resultado:
- WhatsApp UI
- panel evaluación
- highlight de evidencia

### Paso 25. Implementar compartición con Yalo
Resultado:
- permisos efectivos
- corrida o conversación compartible

### Paso 26. Implementar exportación JSON por corrida
Resultado:
- descarga usable y completa

### Paso 27. Implementar expiración y cleanup automático
Resultado:
- retención de 3 meses funcional

### Paso 28. Implementar re-evaluación por subconjunto
Resultado:
- nueva corrida derivada desde filtros

### Paso 29. Endurecer observabilidad y seguridad
Resultado:
- logs, validaciones, masking robusto

### Paso 30. Cerrar con Playwright E2E
Resultado:
- flujos principales protegidos

---

## 6. Validación del tamaño de pasos

La secuencia quedó bien dimensionada porque:

- cada paso tiene salida visible
- cada paso deja el sistema en estado funcional
- no introduce capas grandes sin pruebas
- el provider LLM real queda desacoplado hasta que exista pipeline estable
- UI se conecta progresivamente a funcionalidades ya vivas
- exportación, retención y re-evaluación aparecen después de tener pipeline sólido

---

## 7. Estrategia de testing

### Unit tests
Para:
- parsers
- normalizadores
- servicios de dominio
- consolidación de score
- autorización
- resolución de catálogo

### Integration tests
Para:
- repositorios Prisma
- endpoints NestJS
- auth flows
- creación de corrida
- encolamiento de jobs

### Contract tests
Para:
- contrato JSON de conversaciones
- respuesta estructurada de jueces
- exportación final JSON

### E2E tests
Para:
- login
- crear corrida
- procesar corrida con fake judge
- ver dashboard
- ver detalle conversación
- compartir con Yalo
- exportar corrida

---

## 8. Prompts incrementales para code-generation LLM

## Prompt 1 — Fundar el monorepo y toolchain

```text
Quiero que crees la base de un monorepo TypeScript para un MVP de evaluación de conversaciones.

Stack objetivo:
- frontend: Next.js + TypeScript + Tailwind
- backend: NestJS + TypeScript
- shared package para tipos y contratos
- testing: Vitest
- e2e: Playwright
- Docker Compose para servicios locales
- package manager: pnpm

Requisitos:
1. Crear estructura de monorepo con:
   - apps/web
   - apps/api
   - packages/shared
2. Configurar pnpm workspaces.
3. Configurar TypeScript base compartido.
4. Configurar lint y format.
5. Configurar Vitest en web, api y shared.
6. Configurar Playwright en web.
7. Crear una página mínima en web que muestre "Sistema de Evaluación".
8. Crear un endpoint GET /health en api que responda 200 con payload JSON.
9. Agregar scripts de workspace para dev, build, test y lint.
10. No agregar lógica de negocio todavía.

Pruebas esperadas:
- test smoke en api para /health
- test smoke en web para render básico
- test simple en shared para verificar importación

Entregables:
- estructura completa
- scripts funcionando
- README mínimo con cómo correr el proyecto

Importante:
- no saltes a auth ni prisma aún
- todo debe quedar compilando
- deja el código limpio y tipado
```

## Prompt 2 — Infra local reproducible

```text
Sobre la base ya creada, agrega infraestructura local reproducible para desarrollo.

Objetivo:
- levantar PostgreSQL y Redis con Docker Compose
- exponer variables de entorno claras para web y api

Requisitos:
1. Crear docker-compose.yml con:
   - postgres
   - redis
2. Agregar archivos .env.example para apps/web y apps/api.
3. Definir variables para:
   - DATABASE_URL
   - REDIS_URL
   - APP_URL
   - API_URL
4. Agregar scripts para levantar y bajar infraestructura local.
5. Agregar un pequeño módulo/config helper en api para validar variables de entorno.
6. Agregar pruebas unitarias para la validación de configuración.
7. Actualizar README con pasos de arranque local.

Restricciones:
- todavía no conectes Prisma
- no agregues BullMQ todavía
- mantén la app corriendo igual que antes
```

## Prompt 3 — Paquete shared y contratos mínimos

```text
Ahora quiero formalizar contratos compartidos iniciales en packages/shared.

Objetivo:
- evitar duplicación de tipos entre web y api
- preparar el terreno para dominio del sistema

Implementa:
1. En packages/shared crea:
   - enums de Role: ADMIN, INTERNAL_ALKOSTO, YALO_READER
   - enums de RunStatus y ConversationStatus mínimos
   - tipos DTO mínimos para HealthResponse y UserSession
2. Exporta todo desde un entrypoint limpio.
3. Usa esos tipos en web y api donde ya tenga sentido.
4. Agrega tests unitarios para enums y tipos serializables.
5. Asegura build independiente del paquete shared.

No agregues todavía contratos de conversaciones ni catálogos.
No agregues lógica de base de datos.
```

## Prompt 4 — Prisma mínimo y migración inicial

```text
Quiero introducir Prisma en apps/api con una primera migración mínima y segura.

Objetivo:
- sentar base de persistencia sin modelar todavía todo el dominio

Implementa:
1. Configura Prisma en apps/api.
2. Crea schema inicial con modelos mínimos:
   - User
   - Run
3. User debe soportar:
   - id
   - email
   - passwordHash
   - role
   - isActive
   - createdAt
   - updatedAt
4. Run debe soportar:
   - id
   - status
   - createdAt
   - updatedAt
5. Crea migración inicial.
6. Crea Prisma service para NestJS.
7. Agrega tests de integración básicos contra base de test para:
   - crear usuario
   - crear run
8. Agrega script de seed que cree un admin inicial.

No implementes auth todavía.
No modeles conversations/messages todavía.
```

## Prompt 5 — Auth básica end-to-end

```text
Con la base existente, implementa autenticación básica con correo y contraseña.

Objetivo:
- login funcional
- sesiones protegidas
- roles mínimos aplicados

Implementa en api:
1. módulo auth
2. endpoint login
3. hash seguro de contraseña
4. sesión basada en **cookie httpOnly + tabla de sesiones en PostgreSQL** (decisión tomada: sin dependencia de Redis para auth, SameSite=Lax para CSRF, expiración configurable vía env var, default 24h)
5. endpoint me

Implementa en web:
1. página login
2. formulario con validación básica
3. guardar sesión de forma segura
4. layout protegido para usuarios autenticados
5. redirección a login si no hay sesión

Pruebas:
- unit tests de auth service
- integration tests de login y me
- test de UI para formulario de login

Restricciones:
- no implementes invitaciones aún
- no implementes gestión de usuarios aún
```

## Prompt 6 — Invitaciones y activación de usuario

```text
Ahora implementa el flujo de invitación por correo para alta de usuarios.

Objetivo:
- permitir que un admin cree un usuario y genere un token de activación
- el usuario define su contraseña en primer ingreso

Implementa:
1. Extiende el modelo de datos con InviteToken.
2. Endpoint admin para crear invitación.
3. Endpoint para consultar si token es válido.
4. Endpoint para activar cuenta con contraseña.
5. Regla de expiración simple del token.
6. En web:
   - pantalla admin de creación de usuario
   - pantalla de activación por token
7. Usa envío de correo simulado/loggeado, no integración real todavía.
8. Tests completos de:
   - creación de invitación
   - activación
   - expiración
   - acceso denegado si no es admin

No implementes todavía cambio de rol ni desactivación.
```

## Prompt 7 — Administración mínima de usuarios

```text
Sobre la base actual, completa la administración de usuarios.

Implementa:
1. listado de usuarios para admin
2. cambiar rol entre INTERNAL_ALKOSTO y YALO_READER
3. desactivar usuario
4. resetear contraseña mediante nuevo token de activación/reset
5. proteger todos los endpoints con autorización por rol

En web:
1. tabla simple de usuarios
2. acciones admin:
   - cambiar rol
   - desactivar
   - resetear contraseña

Pruebas:
- authorization tests
- integration tests de acciones admin
- UI tests básicos de listado y acciones

No agregues todavía auditoría administrativa.
```

## Prompt 8 — Modelo de dominio principal

```text
Ahora quiero expandir Prisma para incluir el dominio central del sistema.

Agrega modelos mínimos, bien normalizados y con relaciones claras para:
- Catalog
- Run
- Conversation
- Message
- Evaluation
- Finding
- Pattern
- ShareRecord
- ExportJob

Requisitos funcionales:
- Conversation pertenece a un Run
- Conversation tiene muchos Message
- Evaluation pertenece a Conversation
- Finding pertenece a Evaluation
- Pattern puede asociarse a Evaluation o Conversation; elige diseño simple y consistente
- Catalog debe guardar fecha efectiva del catálogo
- ShareRecord debe permitir compartir corrida completa o conversación individual
- ExportJob debe soportar exportación JSON por corrida

Importante:
- no implementes endpoints todavía
- documenta el razonamiento del modelo
- crea migración y tests de integración de relaciones clave
- mantén compatibilidad con lo ya implementado
```

## Prompt 9 — Carga de catálogos diarios

```text
Implementa la carga de catálogos diarios en el backend y una UI mínima en frontend.

Objetivo:
- subir archivo de catálogo
- inferir fecha desde el nombre del archivo
- persistir metadata y artefacto procesado

Requisitos:
1. endpoint protegido para upload de catálogo
2. extraer fecha desde nombre tipo filtered_products_20260128
3. normalizar fecha a ISO
4. persistir Catalog con metadata
5. almacenar el archivo procesado usando un puerto de storage abstraído; por ahora crea una implementación local o in-memory fácil de testear
6. UI simple para subir catálogo
7. listado simple de catálogos cargados

Pruebas:
- parser de fecha de archivo
- upload exitoso
- rechazo si nombre no contiene fecha válida
- autorización solo para usuarios internos/admin

No integres GCS real todavía; deja interfaz preparada.
```

## Prompt 10 — Contrato estricto y parser de conversaciones

```text
Implementa el contrato estricto del archivo JSON de conversaciones.

Objetivo:
- parsear un archivo con múltiples conversaciones
- validar por conversación
- aceptar parcialmente el lote

Requisitos:
1. Define en shared el contrato canónico de input:
   - cada conversación trae session_id, date, messages
   - cada mensaje trae message_id, role, content/text, timestamp
   - role solo user/assistant
   - content debe tratarse como texto plano
2. Crea parser/normalizador en api que:
   - convierta date/timestamp a ISO 8601
   - ordene mensajes por timestamp
   - separe conversaciones válidas de no evaluables
   - produzca motivo explícito por conversación inválida
3. Agrega masking de teléfonos como utilidad independiente, pero aún no lo conectes al pipeline final.
4. Agrega tests unitarios y de integración exhaustivos para:
   - conversación válida
   - mensajes desordenados
   - role inválido
   - faltan campos
   - lote mixto válido/inválido

No crees aún la corrida desde UI.
```

## Prompt 11 — Crear corrida y persistir lote

```text
Usando el parser ya creado, implementa el flujo de creación de corrida con un archivo JSON de conversaciones.

Objetivo:
- usuario interno sube un archivo
- sistema crea una corrida
- persiste conversaciones válidas y no evaluadas

Implementa en api:
1. endpoint para crear corrida desde archivo JSON
2. uso del parser/normalizador
3. persistencia de:
   - Run
   - Conversation
   - Message
   - estado de conversación
   - motivo de no evaluación si aplica
4. nombre automático de corrida: identificador técnico simple + fecha de ejecución

Implementa en web:
1. acción desde dashboard o pantalla simple para subir archivo
2. feedback de cantidad:
   - válidas
   - no evaluadas
3. navegación al historial de corridas

Pruebas:
- integración end-to-end del endpoint
- persistencia correcta del lote
- nombre automático generado

No lances todavía jobs de evaluación.
```

## Prompt 12 — Historial básico de corridas

```text
Implementa un historial básico de corridas.

Objetivo:
- poder listar corridas creadas antes de tener evaluación completa

Requisitos:
1. endpoint para listar corridas con columnas mínimas:
   - fecha/hora
   - id/nombre
   - estado
   - total conversaciones
   - no evaluadas
2. endpoint para detalle básico de corrida
3. página en web con tabla historial
4. navegación desde dashboard a historial
5. abrir una corrida y ver su resumen básico y lista de conversaciones

Pruebas:
- integración de endpoints
- UI test de tabla historial
- manejo de corridas sin evaluación aún
```

## Prompt 13 — BullMQ y pipeline async base

```text
Integra BullMQ y Redis para empezar a procesar conversaciones asíncronamente.

Objetivo:
- un job por conversación
- progreso agregado por corrida

Implementa:
1. configuración BullMQ en api
2. cola de evaluation jobs
3. servicio para lanzar corrida manualmente
4. al lanzar una corrida:
   - encolar un job por conversación válida
   - actualizar estado agregado de Run
5. worker inicial que aún no evalúa con LLM, solo simula procesamiento exitoso y marca progreso
6. endpoint para ver progreso agregado de corrida
7. botón en web para lanzar una corrida manualmente

Pruebas:
- unit tests del servicio de encolamiento
- integration tests de transición de estado
- test del progreso agregado

No implementes cancelación todavía.
No implementes evaluación real todavía.
```

## Prompt 14 — Abstracción LLM y fake judge

```text
Ahora crea una abstracción limpia para evaluaciones LLM sin depender todavía de un proveedor real.

Objetivo:
- hacer testeable el pipeline de evaluación

Implementa:
1. interfaces/puertos para:
   - IntegrityJudge
   - ConversationalQualityJudge
   - PatternJudge
   - **ConsolidatorJudge** (cuarto juez: recibe salidas de los tres anteriores, decide score + etiqueta final)
2. tipos de respuesta tipados y serializables en shared
3. fake implementations determinísticas para tests (incluyendo fake consolidator)
4. versionado de prompt/rúbrica por juez:
   - crea `apps/api/prompts/integrity/system.md`, `user.md`
   - crea `apps/api/prompts/quality/system.md`, `user.md`
   - crea `apps/api/prompts/patterns/system.md`, `user.md`
   - crea `apps/api/prompts/consolidator/system.md`, `user.md`
   - crea `PromptLoader` service en `apps/api/src/judges/prompt-loader.service.ts`:
     - carga todos los archivos al iniciar (en memoria, no por llamada)
     - resuelve variables `{{placeholder}}` en el prompt de usuario
     - devuelve el hash SHA-256 (primeros 8 chars) de cada archivo como versión
     - si falta algún archivo: throws en startup (no silencioso)
   - los fake judges ignoran los archivos de prompt pero respetan el mismo contrato de interfaz
   - el snapshot almacena `promptVersions: { integrity: { system, user }, quality: {...}, patterns: {...}, consolidator: {...} }`
5. inyección de dependencias en NestJS

Pruebas:
- unit tests de fake judges (incluyendo consolidator)
- unit tests de PromptLoader: carga, sustitución de variables, generación de hash
- tests de contratos de salida
- asegurar que el worker pueda invocar los jueces fake

No conectes aún proveedor real.
```

## Prompt 14b — PoC con Gemini real (checkpoint de validación)

```text
Conecta temporalmente Gemini 2.0 Flash para validar que los prompts y el pipeline funcionan end-to-end con un proveedor real.

Objetivo:
- validar calidad de respuestas de los 4 jueces con una conversación real
- medir costo (tokens input/output) por conversación
- confirmar que el catálogo completo cabe en contexto

Implementa:
1. adaptador Gemini para los 4 puertos de judge (IntegrityJudge, ConversationalQualityJudge, PatternJudge, ConsolidatorJudge)
2. usar @google-cloud/vertexai o @google/generative-ai SDK
3. configurar JSON mode de Gemini para respuestas estructuradas
4. script CLI standalone que:
   - carga un archivo de conversación de ejemplo (session_*.json)
   - carga un catálogo de ejemplo (filtered_products_*.json)
   - ejecuta los 4 jueces en secuencia
   - imprime resultados + tokens usados + costo estimado

Resultado esperado:
- confirmación de que Flash produce output de calidad suficiente (o decisión de escalar a Pro)
- costo estimado por conversación (4 llamadas × tokens)
- ajustes necesarios a los prompts antes de continuar

Este script es temporal y no se integra al pipeline aún. Sirve como checkpoint de validación.
```

## Prompt 15 — Resolver catálogo por fecha

```text
Implementa la lógica para resolver el catálogo correspondiente a la fecha de una conversación.

Objetivo:
- encontrar el catálogo correcto antes de evaluar

Requisitos:
1. servicio que dado una conversación resuelva el Catalog por fecha
2. si no existe catálogo:
   - marcar conversación como no evaluada
   - registrar motivo explícito
3. tests de:
   - catálogo encontrado
   - no existe catálogo
   - múltiples catálogos distintos por fecha en una misma corrida
4. integra este paso al worker antes de los jueces

No hagas todavía integridad ni calidad.
```

## Prompt 16 — Judge de Integridad

```text
Implementa el módulo de Integridad usando el puerto de judge ya definido.

Objetivo:
- evaluar transcript + catálogo del día
- producir hallazgos tipados

Requisitos:
1. servicio de dominio para ejecutar Integridad
2. enviar el **catálogo completo** como contexto al juez (sin pre-filtrado; Gemini soporta 1M tokens)
3. salida con:
   - hallazgos por tipo
   - severidad advertencia/crítica
   - explicación breve opcional
4. aplicar masking de teléfonos al persistir o exponer transcript/evidencias
5. persistir findings y resultado parcial de Integridad
6. usar fake judge suficientemente rico para tests
7. si la conversación no tiene catálogo (coincidencia exacta por fecha), no debe correr Integridad

Pruebas:
- unit tests del servicio
- integración con DB
- verificación de masking
```

## Prompt 17 — Judge de Calidad Conversacional

```text
Implementa el módulo de Calidad Conversacional.

Objetivo:
- producir score principal de la conversación

Requisitos:
1. sub-scores:
   - entendimiento de la necesidad
   - calidad de la recomendación
   - fluidez/claridad
2. mismo peso por defecto entre los tres
3. score total 0.0 a 10.0
4. hallazgos automáticos al menos para:
   - exceso de opciones cuando aplica
   - mensaje demasiado denso para WhatsApp
5. explicación breve y evidencias referenciadas
6. persistencia del resultado parcial

Pruebas:
- cálculo de score
- presencia de hallazgos automáticos
- salida serializable y consistente
```

## Prompt 18 — Judge de Patrones/Escenarios

```text
Implementa el módulo de Patrones/Escenarios.

Objetivo:
- clasificar conversaciones en taxonomía base
- soportar emergentes

Requisitos:
1. aceptar taxonomía base configurable fuera del código de negocio
2. permitir patrones emergentes en la salida
3. guardar explicación breve y evidencias
4. persistir patrones detectados
5. no impactar el score final del MVP

Pruebas:
- patrón conocido
- patrón emergente
- persistencia correcta
```

## Prompt 19 — Juez Consolidador y cierre de corrida

```text
Implementa el juez Consolidador (cuarto paso LLM) y el cierre de corrida.

Objetivo:
- el Consolidador recibe las salidas de Integridad, Calidad y Patrones y decide el resultado final
- cerrar la corrida con agregados

Requisitos:
1. servicio ConsolidatorJudge usando el puerto definido en Prompt 14:
   - input: hallazgos de Integridad (o null si falló), sub-scores de Calidad (o null), clasificación de Patrones (o null)
   - output: score final 0.0–10.0, etiqueta (`aprobada` 8.5–10.0, `con hallazgos` 6.0–8.4, `fallida` <6.0), explicación
   - si algún juez anterior falló (null), el Consolidador produce resultado con nota explicativa
   - usar prompt de `apps/api/prompts/consolidator/system.md` y `user.md`
2. integrar Consolidador al worker como paso 5 (después de Patrones, antes del snapshot)
3. generar snapshot persistido con:
   - transcript
   - resultados por criterio (los 3 jueces + consolidador)
   - versiones de jueces/prompts (4 hashes)
   - timestamp
4. consolidación de corrida:
   - total
   - evaluadas
   - no evaluadas
   - score agregado
   - distribución de etiquetas
5. estados de corrida:
   - procesando
   - completada
   - completada con fallos parciales

Pruebas:
- consolidador con todos los jueces exitosos
- consolidador con hallazgo crítico de Integridad
- consolidador con un juez en null (error)
- corrida con mezcla de evaluadas/no evaluadas
```

## Prompt 20 — Cancelación de corrida sin publicación

```text
Implementa cancelación de corrida con la regla del MVP.

Objetivo:
- si se cancela, no se publica nada y no queda visible en historial

Requisitos:
1. endpoint para cancelar corrida en procesamiento
2. marcar la corrida como cancelada internamente
3. detener encolamiento futuro y evitar publicación final
4. excluir corridas canceladas del historial y dashboard
5. manejar jobs que terminen tarde sin publicar resultados visibles

Pruebas:
- cancelar antes de completar
- corrida cancelada no visible
- jobs tardíos no publican
```

## Prompt 21 — Dashboard de última corrida

```text
Implementa el dashboard principal mostrando la última corrida disponible.

Objetivo:
- entregar valor de lectura ejecutiva

Requisitos:
1. endpoint backend para última corrida visible
2. agregados:
   - score agregado
   - distribución de estados
   - evaluadas/no evaluadas
   - métricas clave de calidad
   - métricas básicas de integridad
3. comparación contra corrida inmediatamente anterior
4. en frontend:
   - dashboard simple, claro y responsive
   - acciones principales:
     - subir nuevo archivo
     - ir al historial

Pruebas:
- endpoint con y sin corrida previa
- render correcto en web
```

## Prompt 22 — Detalle de corrida y tabla de conversaciones

```text
Implementa el detalle de corrida.

Objetivo:
- permitir navegar desde agregado a conversación individual

Requisitos:
1. endpoint de detalle de corrida con:
   - resumen agregado
   - lista paginada de conversaciones
   - estado
   - score
   - etiqueta
   - motivo si no evaluada
2. filtros básicos por estado y fecha
3. web:
   - tabla de conversaciones
   - navegación al detalle de conversación

Pruebas:
- integración del endpoint
- UI test de filtros y navegación
```

## Prompt 23 — Vista detallada de conversación tipo WhatsApp

```text
Implementa la vista detallada de conversación.

Objetivo:
- panel izquierdo conversación tipo WhatsApp
- panel derecho evaluación por criterio

Requisitos:
1. panel izquierdo:
   - mensajes ordenados
   - diferenciación user/assistant
2. panel derecho por criterio:
   - Integridad
   - Entendimiento
   - Calidad de recomendación
   - Fluidez/claridad
   - Patrones/Escenarios
3. mostrar hallazgos y evidencias
4. al hacer click en hallazgo, resaltar fragmento relacionado en la conversación
5. mostrar interpretación del mensaje del usuario cuando exista en evaluación

Pruebas:
- render de conversación
- navegación evidencia -> mensaje
- estado de conversación no evaluada
```

## Prompt 24 — Compartición con Yalo

```text
Implementa compartición explícita con Yalo.

Objetivo:
- compartir corrida completa o conversación individual
- todos los usuarios Yalo ven lo mismo compartido

Requisitos:
1. modelo y endpoints para compartir:
   - corrida
   - conversación
2. compartir corrida implica compartir todas sus conversaciones
3. enforcement de permisos:
   - usuarios Yalo solo ven lo compartido
   - usuarios internos pueden compartir
4. en web:
   - acción directa "Compartir con Yalo" en corrida y conversación
   - vista/listado simple de compartido con Yalo
5. no implementar descompartir

Pruebas:
- permisos por rol
- visibilidad correcta para Yalo
- herencia de compartir corrida -> conversaciones
```

## Prompt 25 — Exportación JSON por corrida

```text
Implementa exportación JSON de corrida completa.

Objetivo:
- descargar una corrida completa de forma reproducible

Requisitos:
1. endpoint para generar y descargar exportación JSON
2. incluir:
   - metadata de corrida
   - configuración usada
   - catálogos asociados
   - conversaciones
   - mensajes
   - evaluaciones
   - hallazgos
   - patrones
   - scores
3. disponible para cualquier usuario interno
4. usar puerto de storage para guardar artefacto exportado antes de descargarlo si lo ves conveniente
5. no incluir datos de compartición con Yalo

Pruebas:
- contrato del JSON exportado
- permisos correctos
- contenido reproducible
```

## Prompt 26 — Retención y cleanup automático

```text
Implementa política de retención de 3 meses.

Objetivo:
- mostrar expiración y borrar automáticamente

Requisitos:
1. calcular fecha de expiración de la corrida
2. mostrarla en historial y dashboard
3. job programado de cleanup que:
   - elimine resultados expirados
   - elimine artefactos asociados en storage
4. no eliminar corridas antes de tiempo
5. agregar logs de cleanup

Pruebas:
- cálculo de expiración
- cleanup sobre datos vencidos
- no borrar datos vigentes
```

## Prompt 27 — Re-evaluación por subconjunto

```text
Implementa re-evaluación por subconjunto de conversaciones.

Objetivo:
- generar nueva corrida derivada desde filtros

Requisitos:
1. filtros base:
   - estado final
   - tipo/severidad de hallazgo
   - módulo/criterio
   - fecha de conversación
   - patrón/escenario detectado
2. endpoint para crear nueva corrida derivada con subconjunto
3. persistir referencia a corrida origen
4. reusar pipeline existente
5. UI mínima para seleccionar filtros y lanzar re-evaluación

Pruebas:
- subconjunto correcto
- nueva corrida ligada a origen
- no sobrescribe corrida anterior
```

## Prompt 28 — Adaptadores Google Cloud

```text
Ahora prepara el proyecto para Google Cloud sin romper el desarrollo local.

Objetivo:
- dejar adaptadores de infraestructura cloud listos

Implementa:
1. adaptador de storage para Google Cloud Storage
2. configuración preparada para Cloud SQL
3. configuración preparada para Redis administrado
4. dockerfiles para web y api
5. archivos base de despliegue/documentación para Cloud Run
6. mantener implementación local test-friendly para desarrollo

Pruebas:
- tests unitarios de los adaptadores mediante mocks
- no uses recursos cloud reales en tests
```

## Prompt 29 — Observabilidad y seguridad final

```text
Endurece la aplicación para un MVP serio.

Objetivo:
- logs estructurados
- validación de inputs
- seguridad básica consistente

Implementa:
1. logs estructurados con correlation id por request/run
2. validación estricta de DTOs
3. manejo centralizado de errores
4. headers de seguridad razonables en web
5. revisión del masking de teléfonos en todos los puntos de salida
6. limitar acciones por rol de forma consistente

Pruebas:
- error handling
- masking en respuestas
- acceso denegado por rol
```

## Prompt 30 — Playwright E2E de flujos críticos

```text
Cierra el proyecto con pruebas E2E de los flujos principales usando Playwright.

Objetivo:
- asegurar que el MVP funciona de punta a punta con dependencias fake/locales

Cubre al menos:
1. login
2. admin invita usuario
3. usuario activa cuenta
4. usuario interno sube catálogo
5. usuario interno crea corrida desde archivo JSON
6. usuario interno lanza evaluación con jueces fake
7. dashboard muestra última corrida
8. historial lista la corrida
9. detalle de conversación abre y muestra panel de evaluación
10. compartir con Yalo
11. usuario Yalo ve contenido compartido
12. exportación JSON de corrida

Requisitos:
- usa fixtures o seeds reproducibles
- no dependas de proveedor LLM real
- deja documentación clara para correr E2E localmente
```
