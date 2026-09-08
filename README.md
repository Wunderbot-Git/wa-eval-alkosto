# Evaluación de conversaciones WhatsApp · Alkosto

Piloto para evaluar la calidad comercial de las respuestas de agentes Yalo, revisar evidencia con personas del equipo y preparar mejoras verificables. La interfaz principal es `/workspace`; las pantallas anteriores siguen disponibles.

## Qué permite la versión actual

- Importar exportaciones CSV de Yalo, seudonimizar usuarios y reconstruir conversaciones por actividad, cierre y encuesta.
- Evaluar con Gemini en dos etapas: extracción y juicio sobre siete criterios. Cada resultado conserva versión, explicación y referencias a mensajes.
- Consultar un resumen de hallazgos, cobertura y estado de revisión. La nota de IA no sustituye la revisión comercial.
- Revisar el chat en estilo WhatsApp: confirmar, corregir, descartar o posponer hallazgos; añadir observaciones desde mensajes y destacar buenas respuestas. Se conserva el historial y se puede deshacer la última acción propia.
- Preparar solicitudes de mejora y registrar pruebas manuales. La aplicación no envía correos ni mensajes de WhatsApp.

## Desarrollo local

Requisitos: Node.js 22, pnpm 10, PostgreSQL 16 y Redis 7. Python 3 y gcloud son opcionales para scripts del piloto y acceso local a Google Cloud.

```sh
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
```

Antes de arrancar, configurar `DATABASE_URL`, `REDIS_URL` y secretos aleatorios persistentes para `SESSION_SECRET` y `PSEUDONYM_SECRET`. No versionar `.env`. Cambiar el secreto de seudonimización impide reconciliar nuevas importaciones con las identidades anteriores.

Para servicios de desarrollo se puede usar `pnpm infra:up`; el compose incluido usa PostgreSQL en 5432 y Redis en 6379. Utiliza credenciales de desarrollo y debe revisarse antes de uso compartido.

```sh
pnpm --filter @eval/shared build
pnpm --filter @eval/api exec prisma generate
pnpm --filter @eval/api exec prisma migrate deploy
pnpm --filter @eval/api exec prisma db seed
pnpm dev
```

Abrir [workspace local](http://localhost:3000/workspace). El seed crea usuarios de desarrollo definidos en `apps/api/prisma/seed.ts`; sustituir sus credenciales antes de exponer el entorno. Un clon limpio no contiene conversaciones ni resultados del piloto.

La evaluación real del workspace requiere Gemini. Para Vertex AI local, configurar `GOOGLE_AUTH_MODE=gcloud`, proyecto y modelo en `.env`, ejecutar `gcloud auth login` y disponer de permisos y API Vertex AI habilitada. También se admite `GEMINI_API_KEY`. En un despliegue se debe sustituir la autenticación interactiva por identidad de servicio/ADC. La configuración del pipeline anterior es independiente; no confundir sus jueces de prueba con las evaluaciones reales del workspace.

## Validación

```sh
pnpm test
pnpm --filter @eval/api build
pnpm --filter @eval/web build
```

Las pruebas unitarias no necesitan enviar conversaciones a Gemini. Los scripts de integración, importación y evaluación real tienen requisitos y efectos distintos: consultar la [guía operativa](PRIMERA_VERSION.md) antes de ejecutarlos.

## Documentación

| Documento | Contenido |
| --- | --- |
| [Desarrollo del 8 de septiembre de 2026](docs/development/2026-09-08.md) | Entrega del día, decisiones, comprobaciones y próximos pasos |
| [Primera versión](PRIMERA_VERSION.md) | Arranque, operación, UX y límites del piloto |
| [Validación de la muestra](VALIDACION_MUESTRA.md) | Resultados agregados de 31 conversaciones y calibración pendiente |
| [Revisión de la lógica](REVISION_LOGICA_2026-09-08.md) | Diagnóstico inicial, propuesta y revisión del feed |
| [Borrador BigQuery para Yalo](SOLICITUD_BIGQUERY_YALO.md) | Solicitud técnica preparada, sin enviar |

`spec.md`, `prompt_plan.md`, `summary.md` y `todo.md` documentan la arquitectura previa. No deben interpretarse como el estado actualizado del workspace; la guía y el registro de desarrollo describen esta entrega.

## Límites relevantes

El piloto aún no está listo para operación continua: falta resolver la extracción diaria eficiente de BigQuery, acreditar la vigencia histórica del catálogo Algolia y calibrar el evaluador con decisiones humanas. Las sesiones se reconstruyen en memoria y las evaluaciones se ejecutan bajo demanda; faltan jobs persistentes, paginación y política de retención de los modelos Review*.

La ocultación de teléfonos y correos detectados no elimina todos los datos personales del texto. Los CSV, claves, backups y resultados individuales permanecen fuera de Git. El proyecto [alkosto-yalo-feed](https://github.com/Wunderbot-Git/alkosto-yalo-feed) conserva la responsabilidad de generar/publicar el catálogo; esta entrega no publica cambios en ese repositorio.
