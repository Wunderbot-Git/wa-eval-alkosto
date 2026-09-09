# Revisión de lógica y propuesta de evolución

Fecha: 8 de septiembre de 2026. Revisión estática del código, los prompts y el esquema de datos. No se ejecutaron pruebas ni llamadas a modelos, BigQuery, Algolia o Yalo. Propuesta de diseño; no constituye una implementación ni una auditoría exhaustiva de seguridad.

## Objetivo y conclusión

Evaluar conversaciones reales, probar categorías nuevas y verificar las mejoras solicitadas a Yalo. Conservar Next.js, NestJS, PostgreSQL y BullMQ, pero sustituir la lógica centrada en cargas y notas por una cadena trazable: eventos → conversaciones → evidencia → evaluaciones → problemas → cambios → pruebas.

Algolia puede ser la fuente de catálogo actual. No debe usarse el índice actual para juzgar hechos comerciales históricos sin evidencia de su vigencia. Tampoco permite por sí solo saber qué resultados recibió Yalo.

## Hallazgos en la implementación

| Evidencia en el repositorio | Consecuencia | Cambio propuesto |
| --- | --- | --- |
| `conversation-parser.service.ts` exige JSON con `session_id` y mensajes de texto; `Message` guarda rol, contenido y orden | No admite directamente los eventos reales de BigQuery y pierde IDs, timestamps y componentes interactivos | Importador de eventos con identificadores originales, deduplicación y reconstrucción de sesiones |
| `evaluation.worker.ts` descarta toda conversación sin catálogo de fecha exacta | La cobertura depende del catálogo incluso para evaluar comprensión o comunicación | Aplicabilidad y suficiencia de evidencia por criterio |
| `catalog.service.ts` usa `findFirst` por fecha; el esquema no impone una versión única por fecha | Dos cargas del mismo día pueden producir una selección ambigua | Versiones inmutables con captura, vigencia y procedencia |
| Extracción e integridad reciben el índice reducido completo | Coste crece con todo el catálogo, aunque se hable de pocos productos | Resolver SKU/enlaces primero y recuperar evidencia focalizada |
| `pickCandidateAlternatives` toma las primeras diez entradas de la categoría de los productos mencionados | No ordena por adecuación, no filtra disponibilidad y no encuentra alternativas si no hubo producto reconocido | Recuperación basada en necesidad y categoría solicitada, con atributos verificables |
| Las alternativas carecen de fichas completas | No hay base suficiente para afirmar que una alternativa es técnicamente superior | Enriquecer alternativas antes de emitir un hallazgo comparativo |
| Se extrae una necesidad global de toda la conversación | Riesgo de juzgar recomendaciones anteriores con requisitos revelados después o mezclar dos categorías | Necesidades por episodio y vigentes al momento de cada recomendación |
| Calidad puntúa recomendación y otro juez vuelve a penalizarla | Doble castigo del mismo problema | Criterios diferenciados y deduplicación por afirmación/requisito |
| El consolidador LLM ejecuta una fórmula fija | Coste e inconsistencia evitables | Nota y etiqueta calculadas en código; síntesis textual opcional |
| El ejemplo del prompt consolidador etiqueta `con_hallazgos` un error crítico pese a exigir `fallida`; además trata un cero como dato ausente | Instrucciones contradictorias y confusión entre cero y ausencia | Rúbrica explícita, precedencia de reglas y estados de datos separados |
| Adaptadores normalizan campos ausentes a cero o listas vacías | Una salida defectuosa puede parecer una mala conversación o ausencia de problemas | Validación estricta del esquema y estado de fallo del evaluador |
| `Snapshot` conserva resultados y hashes de prompts | No basta para reproducir la evaluación: faltan entradas exactas, catálogo y configuración del modelo | Paquete de evidencia inmutable vinculado a cada ejecución |
| Reevaluar copia la conversación; no ejecuta Yalo; comparar usa la corrida anterior del mismo creador | El cambio de nota no demuestra mejora del agente y las muestras pueden ser distintas | Separar reevaluación del juez, regresión del agente y observación de producción |
| Compartición da acceso a resultados, pero no existe entidad de problema/cambio/prueba | No hay cierre verificable del ciclo con soporte | Registro de problemas con solicitudes y pruebas de aceptación |
| Sin clave Gemini se activan jueces ficticios | Resultados de demostración pueden confundirse con reales | Modo demo explícito, etiquetado y prohibido en evaluación productiva |
| El worker captura fallos sin relanzarlos y no comprueba cancelación antes de procesar; recalcula estados del run | BullMQ puede considerar terminado un trabajo fallido; trabajos pendientes pueden continuar tras cancelar | Reintentos limitados, trabajos idempotentes, cancelación efectiva y transiciones protegidas |
| Snapshot único por conversación y borrado/recreación de Evaluation en reintento | Un reintento posterior a crear snapshot puede colisionar con la restricción única | Ejecuciones separadas, escritura transaccional final y recuperación por etapa |
| El dashboard y listado multiplican una nota 0–10 por 100 | Una nota 7,5 puede mostrarse como 750 % | Mostrar 7,5/10; usar porcentajes solo para tasas |
| La exportación enmascara teléfonos al final y no incluye toda la evidencia del snapshot | Protección tardía y exportación insuficiente para revisión reproducible | Seudonimización temprana, tratamiento del texto y exportación por propósito |
| La retención elimina corridas y snapshots a los tres meses | Puede eliminar evidencia de solicitudes aún abiertas | Política diferenciada para datos personales, evidencia autorizada y casos depurados |

## Flujo propuesto

### 1. Eventos y conversaciones

BigQuery conserva su papel de fuente de eventos. CSV y BigQuery alimentan el mismo contrato normalizado. Mantener un cursor de importación y una ventana de solapamiento configurable para eventos tardíos; deduplicar por fuente e identificador de mensaje. Conservar timestamps UTC; presentar días operativos en America/Bogota.

Agrupar por usuario seudónimo. Reconocer el cierre y la encuesta mediante plantillas normalizadas, sin exigir igualdad de espacios o puntuación. La encuesta se asocia a la conversación cerrada; un mensaje numérico no basta por sí solo para identificar una respuesta. Reinicios, fragmentos, respuestas tardías y actividad nueva requieren reglas explícitas. No cortar al cambiar de día. Una hora sin actividad es una frontera provisional cuando falta el cierre, no prueba definitiva de cierre.

Separar eventos comerciales, mensajes automáticos, encuesta y trazas internas. Mantener imágenes y contenido interactivo; si falta un adjunto necesario, marcar la limitación en los criterios afectados. No asumir que todo `is_user_message=false` es una respuesta comercial visible.

Cada conversación puede contener varios episodios de necesidad y varias categorías. Guardar categoría inferida por separado de skill observada; el texto no prueba qué skill ejecutó Yalo.

### 2. Algolia y evidencia histórica

Capturar registros y configuración relevante (settings, rules, synonyms) después de una actualización completada. Preferir el mismo artefacto que alimenta el índice si está disponible. Coordinar la captura con la publicación para evitar una mezcla de versiones mientras se actualiza.

Guardar el original comprimido en almacenamiento de objetos y un manifiesto en PostgreSQL: índice, versión de la carga, captura, intervalo de vigencia conocido, cantidad, hash, estado de completitud y esquema. La fecha de captura no demuestra por sí sola desde cuándo estuvo vigente. Una captura diaria solo alcanza la precisión temporal de la fuente; si cambia intradía, hay que registrar cada publicación relevante.

Separar tres niveles de evidencia:

- Respuesta exacta de la herramienta recibida por Yalo: permite analizar qué información tuvo disponible.
- Snapshot histórico válido: permite contrastar con el catálogo, pero no prueba qué devolvió una búsqueda particular.
- Índice actual: útil para nuevas pruebas y exploración; insuficiente para afirmar precios o stock pasados.

Algolia `browse` sirve para exportar registros, no reproduce el ranking de `search`. Para analizar búsqueda se necesitan consultas, filtros, resultados y configuración utilizados. Probar sobre fixtures guardados cuando sea posible. Sin esas trazas, clasificar la causa como desconocida o hipótesis; no atribuir automáticamente el error a la skill.

Recuperar candidatos a partir de necesidades conocidas en ese turno, incluso cuando Yalo no recomendó nada o recomendó una categoría incorrecta. Filtrar requisitos duros y disponibilidad conocida, distinguir precio regular/promocional/condicionado y obtener atributos completos de finalistas. No equiparar primer resultado con mejor producto. Si la cobertura es insuficiente, no afirmar que faltó «la mejor alternativa».

### 3. Evaluador más sencillo

Diseño inicial a calibrar: una llamada para extraer episodios, necesidades, afirmaciones y referencias; validaciones deterministas; una llamada de juicio comercial con evidencia focalizada. Casos ambiguos o críticos pueden requerir revisión humana o un segundo juicio. Clasificaciones generales pueden salir de la extracción; patrones recurrentes se agrupan sobre múltiples conversaciones.

Validaciones deterministas comparan valores normalizados cuando la identidad del producto y la semántica del dato están confirmadas. Un dato no encontrado no es automáticamente falso; un producto ausente de una muestra no es automáticamente inventado.

Evaluar comprensión, requisitos y adecuación, exactitud, utilidad de comparación, continuidad, resolución y comunicación. Usar `cumple`, `incumple`, `no aplica` y `evidencia insuficiente`, con referencias a mensajes/productos. Mantener la nota como resumen secundario con reglas transparentes. Un fallo crítico confirmado no se compensa con tono amable. La ausencia de compra o respuesta a encuesta no demuestra fracaso.

El pipeline actual hace seis llamadas en el camino completo: extracción, cuatro jueces y consolidador. Para 200–250 conversaciones son 1.200–1.500 llamadas, sin reintentos. La propuesta de dos llamadas base supondría 400–500, más excepciones; es una estimación arquitectónica, no una medición de coste o calidad. Debe validarse con una muestra humana antes de sustituirlo.

Guardar tokens, duración, errores y coste cuando se disponga de tarifa/configuración verificadas. Reutilizar evidencia y resultados por hashes de entrada, catálogo y evaluador. No reutilizar resultados si cambia alguna dependencia.

### 4. Calibración, pruebas y feedback

Comenzar con una muestra estratificada revisada por líderes comerciales: buenas, malas, incompletas, varias intenciones y distintos productos. Comparar por criterio con juicio humano; medir falsos positivos críticos, omisiones y desacuerdos. Congelar una parte como conjunto de validación. No seleccionar un juez solo por su promedio de notas.

Mantener tres operaciones separadas:

1. Reevaluar respuestas existentes para mejorar el evaluador, con evidencia idéntica.
2. Ejecutar una versión nueva de Yalo sobre casos de regresión comparables.
3. Medir producción por categoría, intención y versión, mostrando tamaños de muestra y cobertura; no interpretar una comparación temporal como prueba causal por sí sola.

Por ahora los casos pueden ejecutarse manualmente en WhatsApp. Registrar reset/contexto, pasos, respuestas y versión comunicada por Yalo. Un reset no garantiza borrar toda memoria: documentar su alcance. Sin API o capacidad de restauración de estado, no prometer snapshots plenamente reproducibles. Evolucionar a API cuando esté disponible.

Crear problemas agrupados con severidad, frecuencia entre conversaciones aplicables, evidencia, causa confirmada/hipótesis, propuesta y criterios de aceptación. Generar borradores de correo para soporte; el envío requiere autorización. Registrar referencia de solicitud, responsable, fecha/version del cambio y resultado de verificación. Estados: pendiente, enviado, en implementación, listo para verificar, validado o reabierto. Verificar tanto el caso original como variantes no usadas para diseñar el cambio.

Guardar casos depurados de regresión independientemente de la retención de conversaciones reales, conforme a la política que acuerde el equipo. La encuesta actual es una valoración de recomendación del canal de 1–10; conservar escala original y no confundirla con nota del agente ni aplicar automáticamente una métrica estándar distinta.

## Modelo y prioridades

Entidades propuestas: evento de origen, conversación y revisión de segmentación, episodio, respuesta de encuesta, versión de catálogo, paquete de evidencia, ejecución de evaluación, revisión humana, caso de prueba, ejecución de prueba, problema y solicitud de cambio. Las ejecuciones referencian conversaciones; no las duplican para cada puntuación.

1. Importación/segmentación, protección de datos, preservación de evidencia y fallos técnicos que distorsionan resultados.
2. Capturas de Algolia, recuperación por necesidad, rúbricas por categoría y calibración humana del evaluador simplificado.
3. Seguimiento de problemas, borradores para Yalo y pruebas manuales de regresión.
4. Automatización BigQuery/Algolia, tendencias comparables y eventual ejecución por API.

Mantener la infraestructura actual para el volumen descrito. Medir antes de introducir más servicios o agentes. El tablero principal debería mostrar cobertura, fallos críticos, adecuación por categoría, problemas recurrentes y mejoras verificadas; las corridas quedan como detalle operativo.

## Información pendiente sobre Algolia

- Si es exactamente el índice consultado por Yalo o una fuente paralela.
- Ejemplo de registro y correspondencia entre `objectID`, SKU y URL.
- Quién publica, a qué hora y cómo confirma que terminó; si existen cambios intradía.
- Si hay archivo de origen o snapshots históricos reutilizables.
- Si Yalo puede exportar consultas, filtros, respuestas de herramientas y versión de skill.

## Referencias

- Anthropic: https://claude.com/blog/the-anatomy-of-effective-commerce-agents — snapshots, resultados, casos difíciles, variantes positivas/negativas y expertos de dominio.
- Implementación de referencia: https://github.com/anthropics/commerce-agents
- Algolia, exportación de registros y configuración: https://www.algolia.com/doc/guides/sending-and-managing-data/manage-indices-and-apps/manage-indices/how-to/export-import-indices
- Algolia, browse y diferencias frente a search: https://www.algolia.com/doc/rest-api/search/browse

## Actualización tras revisar alkosto-yalo-feed

El usuario confirma que Yalo consulta el mismo índice. Se clonó y revisó el proyecto vecino `alkosto-yalo-feed`, incluyendo workflow, procesamiento, disparo de conectores, reporte de salud e historial del archivo principal. No se ejecutaron scripts operativos ni se consultó Algolia en vivo.

Hallazgos comprobados:

- `filtered_products.json` ya está versionado mediante commits automáticos. Hay histórico anterior y correspondiente al 31 de agosto, fecha de la muestra de conversaciones. Puede recuperarse por SHA sin crear primero otro exportador diario.
- El workflow y README contemplan dos ciclos diarios. Las horas de disparo no equivalen a horas de publicación efectiva. El script de conectores contempla hasta 30 minutos de espera y documenta una ingesta de 18 minutos.
- El workflow publica en `main`, espera 330 segundos por caché y dispara conectores. `trigger_connectors.py` comprueba el resultado de ingesta y escribe a logs, pero no produce un manifiesto persistente que vincule el commit del JSON con la versión comprobada del índice.
- Existe configuración versionada por índice en `algolia/`: reglas, sinónimos y settings. El repositorio registra la configuración pretendida/exportada; su presencia no demuestra por sí sola vigencia histórica en producción.
- El reporte de salud ya contrasta una muestra de precios con el índice vivo. Es reutilizable como observabilidad, pero una muestra no acredita igualdad de todos los registros.
- Hay índices de Agent Studio y un sandbox además del principal de Yalo. Sus esquemas y rankings difieren: no intercambiar estas fuentes al evaluar producción.
- El feed contiene `tipo_producto`, precios condicionados por medio de pago y atributos derivados que el evaluador debe conservar. La cobertura del feed puede ser más amplia que las skills ya habilitadas.

La propuesta se simplifica: mantener en este proyecto la propiedad de la generación/publicación del catálogo; añadir aquí un manifiesto de publicación por índice y consumirlo desde el evaluador. No duplicar filtros y transformaciones del feed en `wa-eval-alkosto`.

Contrato propuesto del manifiesto: versión del contrato, commit de datos, commit de código/configuración, hash del JSON, índice, run del workflow, run del conector, tiempos de generación/inicio/finalización, cantidad esperada, resultado y alcance de verificación. Separar los estados generado, publicado en Git, ingestado y verificado. Conservar intentos fallidos y publicaciones sin cambio de contenido.

Cuando sea factible, servir al conector un artefacto inmutable identificado por versión. Si debe seguir leyendo `main`, verificar el contenido/versionado efectivo antes de atribuirle vigencia. Usar el primer instante de verificación como límite conservador cuando no exista un instante autoritativo de activación; marcar el intervalo de transición como incierto. Un conector exitoso por sí solo no prueba que leyó el commit esperado.

Para el histórico, recuperar JSON por commit y buscar logs de publicación/ingesta disponibles. Sin esos logs, el catálogo recuperado es evidencia de generación, no prueba de vigencia exacta. No retroasignar el nuevo archivo a todas las conversaciones de ese día.

Prioridad inmediata revisada: contrato de publicación en el feed y contrato de eventos/segmentación en el evaluador. Después enlazar cada afirmación de producto con la evidencia temporal correcta y calibrar el juicio comercial. El almacenamiento de objetos puede añadirse después para independencia del historial Git y política de conservación; no es prerrequisito para el piloto.
