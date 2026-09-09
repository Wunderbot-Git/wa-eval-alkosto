# Borrador para soporte Yalo — consulta diaria de mensajes

Asunto: Alkosto — habilitar extracción diaria eficiente de mensajes en BigQuery

Hola equipo Yalo:

Necesitamos extraer diariamente los mensajes de WhatsApp para evaluar calidad comercial. El volumen esperado es de aproximadamente 200–250 conversaciones al día. Usamos la vista `yalo-eval-wa.yalo_data_sharing___alkosto_co.vw_messages`.

En pruebas **dry-run**, sin importar conversaciones, obtuvimos estas estimaciones para el 31 de agosto de 2026 (día UTC):

| Selección con filtro de día | GB decimales estimados | Precisión informada |
| --- | ---: | --- |
| COUNT(*) con event_date | 31,92 | UPPER_BOUND |
| user_id, event_timestamp, message_id | 46,58 | UPPER_BOUND |
| Identificadores, rol, timestamp, texto y tipo | 54,65 | UPPER_BOUND |
| Lo anterior y message_raw | 65,62 | UPPER_BOUND |
| Selección completa, filtro por event_timestamp | 65,62 | UPPER_BOUND |

Estas cifras son límites superiores estimados, no volumen diario confirmado ni bytes facturados. No hemos ejecutado la extracción con ese presupuesto. Los metadatos disponibles no muestran la definición de la vista ni las tablas base.

¿Pueden confirmar la columna de partición y de clustering, y facilitar una consulta que filtre las particiones correspondientes al intervalo solicitado? Si la vista impide esa reducción, solicitamos una vista o tabla compartida que permita una extracción diaria eficiente, manteniendo el aislamiento de datos de Alkosto.

Requisitos:

- Intervalos semiabiertos por timestamp: inicio incluido, fin excluido; días comerciales en America/Bogota.
- user_id estable, message_id, event_timestamp, is_user_message, message_text, message_type y contenido interactivo necesario. También cierres y encuestas.
- Confirmar zona horaria y semántica de event_date, latencia de llegada, correcciones y ventana recomendada para reimportar mensajes tardíos sin duplicación.
- Una consulta de referencia y evidencia de bytes procesados/facturados para un día, obtenida por ustedes sobre un job existente o de prueba autorizado.
- Confirmar si session_id de vw_custom_agents_fct_sequential identifica conversación completa, invocación de un agente u otra unidad; cómo se relaciona con vw_messages y qué cobertura tiene.

Nuestro importador mantiene un máximo de 5 GB por consulta; no queremos elevarlo sin resolver o explicar el acceso diario. Si UPPER_BOUND es conservador por clustering, necesitamos sus métricas reales y una alternativa con presupuesto predecible.

Gracias.

## Referencias para el equipo

El script `scripts/probe_bigquery.py` reproduce las cinco estimaciones sin ejecutar las consultas. Google explica la estimación superior de tablas agrupadas y el posible rechazo por maximumBytesBilled en [control de costes](https://docs.cloud.google.com/bigquery/docs/best-practices-costs); define UPPER_BOUND en [JobStatistics2](https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/Job).

Este documento es un borrador. No se ha enviado a Yalo.
