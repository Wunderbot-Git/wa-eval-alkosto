# Primera versión local

Entrada: http://localhost:3000/workspace. Usuario inicial de desarrollo del seed: `admin@alkosto.com`, contraseña `admin123`. Uso local; sustituir las credenciales antes de cualquier despliegue compartido.

## Qué funciona

- Importar CSV de Yalo con celdas multilínea y mensajes interactivos. La seudonimización se realiza antes de persistir los eventos. Los campos de destinatario del payload no se guardan; se ocultan teléfonos colombianos/correos detectados en texto. No es un anonimizador universal de datos personales.
- Reconstruir conversaciones por usuario, cierres y encuesta. Separaciones por inactividad explícitamente inferidas; contexto inicial sin confirmar. Las fechas de pantalla usan Colombia y las almacenadas UTC. Los IDs del usuario del CSV deben ser estables: una exportación con otros seudónimos no se puede reconciliar automáticamente con los teléfonos de BigQuery.
- Importar catálogos históricos con origen y fecha de generación. No se presume publicación en Algolia. Los catálogos de Git cargados son referencias; la exactitud factual histórica permanece sin verificar.
- Evaluación real de dos llamadas con Gemini, mediante clave o sesión local gcloud/Vertex AI. Criterios y evidencias validados, cobertura y nota determinista, conservación de entradas/prompts/modelo/uso, revisión humana con historial. No produce evaluaciones ficticias.
- Preparar solicitudes y borradores de correo a Yalo; registrar implementación y evidencia de verificación. No envía correos. Los problemas se crean manualmente; agrupación automática posterior.
- Crear casos de prueba y registrar ejecuciones manuales por versión. Ocho casos iniciales cargados, propuestos en `scripts/starter_cases.json` y sujetos a revisión comercial. Se cargan sin duplicados con `python3 scripts/smoke_workspace.py --seed-cases`. No hay integración de ejecución con WhatsApp.
- Importación manual desde la vista BigQuery `vw_messages`, con estimación previa, máximo siete días y 20.000 eventos. No se ejecuta automáticamente al abrir la aplicación. El límite de bytes se aplica en BigQuery.

## Arranque

Requisitos: Node, pnpm, PostgreSQL y Redis. Instalar con `pnpm install --frozen-lockfile`. Crear `apps/api/.env` a partir del ejemplo, usar una clave aleatoria persistente para `PSEUDONYM_SECRET` y `SESSION_SECRET`, y configurar los servicios locales. No cambiar PSEUDONYM_SECRET entre importaciones del mismo conjunto.

```sh
pnpm --filter @eval/shared build
pnpm --filter @eval/api exec prisma generate
pnpm --filter @eval/api exec prisma migrate deploy
pnpm --filter @eval/api exec prisma db seed
pnpm dev
```

Para este piloto se crearon servicios aislados: PostgreSQL en `127.0.0.1:55432`, Redis en `127.0.0.1:56379`. Los datos PostgreSQL de esta sesión están en `/private/tmp/alkosto-eval-pg`; mover a almacenamiento duradero mediante backup/restore antes de usarlo como sistema de registro permanente. El `docker-compose.yml` ofrece volúmenes persistentes para una instalación posterior, usando 5432 y 6379; editar el compose y las URLs de conexión si se requieren otros puertos.

Con Vertex AI local: `GOOGLE_AUTH_MODE=gcloud`, `GOOGLE_CLOUD_PROJECT=yalo-eval-wa`, `GEMINI_MODEL=gemini-2.5-flash`. `gcloud auth login` debe tener permisos en el proyecto y la API `aiplatform.googleapis.com` habilitada. Los tokens se mantienen en memoria, no en archivos del repositorio. Para despliegue, sustituir el mecanismo local por identidad de servicio/ADC; no desplegar gcloud interactivo.

La API escucha en loopback por defecto; un despliegue en contenedor debe definir `API_HOST` apropiadamente.

## Validación

```sh
pnpm test
pnpm --filter @eval/api exec tsc --noEmit
pnpm --filter @eval/web exec tsc --noEmit
python3 scripts/smoke_workspace.py
```

El smoke requiere los dos repositorios vecinos y `yalo_export.csv`, no versionado. Importa el CSV dos veces y comprueba deduplicación, carga dos catálogos de Git como referencias y verifica la lectura. `--evaluate` envía una conversación al modelo real y requiere autorización sobre ese contenido y destino. `--bigquery` ejecuta una consulta real acotada con el límite configurado por el script.

## Límites conocidos y siguiente iteración

El dry-run de la vista compartida devuelve una estimación `UPPER_BOUND`: 65,62 GB para un día con texto y payload, 54,65 GB sin payload y 31,92 GB para COUNT. Esto no acredita tamaño real diario ni consumo facturado. Los filtros por `event_date` y timestamp no resuelven la estimación. La definición y las tablas base no están visibles en los metadatos recibidos. No se ha elevado silenciosamente el límite: la interfaz estima antes de pedir importar con máximo 5 GB; consultas mayores quedan bloqueadas. Se recomienda pedir a Yalo una vista que permita reducción por partición o una extracción incremental optimizada.

También existe `vw_custom_agents_fct_sequential` con `session_id`, `session_start_time`, `session_end_time`, `main_argument`, `info`, `body` y contadores de herramientas. Solo se revisó su esquema. No afirmar que estas sesiones equivalen a las conversaciones de atención hasta validar semántica/cobertura.

El piloto reconstruye sesiones sobre los eventos disponibles y carga el conjunto en memoria; para mayor histórico, materializar sesiones y paginar. Evaluaciones se ejecutan bajo demanda en el proceso de API; antes de automatizar lotes moverlas a jobs persistentes con recuperación por etapa. Los hallazgos críticos requieren calibración comercial; una nota alta con cobertura parcial no certifica la recomendación.

Los modelos Review* aún no tienen limpieza automática. Definir retención y conservación de casos depurados antes de cargas continuas. El portal de compartición antiguo no muestra automáticamente estas nuevas solicitudes; el canal de entrega V1 es el borrador de correo revisado por una persona.

En el feed vecino se preparó, sin publicar, un manifiesto de resultados de conectores como artifact del workflow. Registra observaciones, no garantiza por sí solo activación del contenido esperado. Falta verificación de contenido del índice y consumo automático de manifiestos.

## Resultado de la comprobación del 8 de septiembre de 2026

- 397 eventos del CSV, 31 conversaciones reconstruidas, 12 con cierre Yalo. Reimportar no agrega duplicados.
- Dos referencias históricas del catálogo con 4.958 y 4.950 productos. Su publicación en Algolia no está acreditada.
- Ocho casos comerciales cargados para ejecución manual.
- API Vertex AI habilitada con autorización; 31 conversaciones evaluadas realmente con Gemini 2.5 Flash y rúbrica `pilot-2`. Se preservó el historial de la rúbrica anterior y se recuperó texto de ocho carruseles. Resultado final: 1 conversación crítica, 5 con otros hallazgos, 22 con evidencia insuficiente y 3 sin hallazgos observados. Ver `VALIDACION_MUESTRA.md` para interpretación y calibración pendiente.
- 268 pruebas API y 23 pruebas web correctas al cerrar la revisión guiada; compilaciones correctas y comprobación de tipos tras los ajustes de interfaz.
- Consultas BigQuery de diagnóstico únicamente dry-run; no se ejecutó la importación de 60–65 GB rechazada. Solicitud técnica preparada en `SOLICITUD_BIGQUERY_YALO.md`, sin enviar.
- Copia local de la base creada en `.local/pilot-backup.dump`, excluida de Git, permisos 600. Incluye la muestra, las evaluaciones y los casos. Para restaurar en una base nueva y vacía: `pg_restore --no-owner --no-privileges -d <conexion_base_nueva> .local/pilot-backup.dump`. Conservar también los secretos locales de `.env` de forma privada para mantener identidades.

## Dashboard de evaluaciones

La entrada `/workspace` abre **Resumen**. Muestra solo la última evaluación vigente por conversación; los resultados anteriores se conservan en el historial y no se suman. La clasificación prioriza: hallazgo crítico, otros hallazgos, evidencia insuficiente y sin hallazgos observados. Sin evaluar y reevaluación necesaria son estados separados. Una nota alta con evidencia parcial nunca se clasifica automáticamente como resultado limpio.

Los filtros usan fecha de inicio de conversación en Colombia, categoría extraída (con equivalencias como portátil/computador) y última revisión humana. La categoría es una inferencia del análisis, no el identificador de la skill de Yalo. Las barras cuentan conversaciones con incumplimiento por criterio; una conversación puede contribuir a varios criterios. La tabla abre por defecto las evaluaciones vigentes y permite incluir todas las conversaciones.

**Ver evaluación** abre la revisión guiada con el resultado y el chat lado a lado. Cada hallazgo muestra explicación y mensajes citados, incluidas las tarjetas del carrusel. Las decisiones por hallazgo conservan el dictamen original de IA.

## Referencias visuales de Alkosto

La interfaz usa `dashboard_ui_2.webp` como referencia de estructura: navegación clara, paneles blancos, métricas compactas y gráficos separados. `dashboard_ui.webp` orienta los acentos de profundidad. Los tokens de `alkosto-theme.css` siguen las imágenes `design_system_alkosto_1–3`: Arial, naranja #EB5825 / hover #B14825, azul #004797, fondos #EDF1F6 / #E2E9F1 y colores semánticos para alertas y errores. Los logos oficiales suministrados (`Logo-alkosto.svg` y `Logo_Yalo.png`) se sirven desde `apps/web/public/brand`, conservando proporciones y colores.

El gráfico circular representa avance de evaluación del filtro actual, no tasa de éxito ni calidad. No se añadieron series históricas o métricas simuladas para reproducir las referencias.

## Espacio de revisión

El menú **Revisión** abre una mesa de trabajo con evaluación y hallazgos a la izquierda y la conversación en estilo WhatsApp a la derecha. Cliente en blanco a la izquierda del chat, agente en verde a la derecha; cierres y encuestas se distinguen como mensajes automáticos. Es una representación de los datos exportados, sin indicadores de entrega o lectura inventados ni envío de mensajes.

Seleccionar un criterio resalta sus mensajes citados y desplaza únicamente el chat a la primera referencia. Las flechas recorren la evidencia en orden cronológico. La cola permite filtrar hallazgos o revisiones pendientes y pasar al caso anterior/siguiente. Se guarda la revisión de la evaluación y se puede preparar una solicitud de mejora; no se envían correos. En móvil se alterna entre las dos áreas.

Los tamaños del dashboard aumentaron: texto principal 14–15 px, metadatos 12–13 px y cifras 34 px.

### Revisión humana guiada

La sección Revisión permite confirmar, corregir, descartar o dejar pendiente cada hallazgo. Corregir requiere explicación, criterio y gravedad; descartar y posponer requieren motivo. La selección de mensajes permite crear hallazgos humanos o destacar buenas respuestas, con evidencia enlazada. El original de IA se conserva: las acciones se guardan con revisor y fecha en un historial, con deshacer de la última acción propia. Se rechazan actualizaciones concurrentes y evaluaciones obsoletas.

Finalizar exige resolver los hallazgos y confirmar la lectura del resto del chat. El dashboard distingue revisión pendiente, en curso y finalizada; la clasificación de calidad sigue mostrando el dictamen de IA, separado de las decisiones humanas. No se envían mensajes ni se ejecuta Gemini al revisar. Las solicitudes de mejora de un hallazgo IA se habilitan después de confirmarlo o corregirlo.
