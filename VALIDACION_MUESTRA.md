# Validación de la muestra de WhatsApp

Se evalúan las 30 conversaciones pendientes con la misma rúbrica `pilot-2` y Gemini 2.5 Flash en Vertex AI, autorizadas por el responsable del proyecto. La conversación previamente evaluada permanece sin cambios. No se ejecutan consultas adicionales en BigQuery.

## Qué estamos validando

- Que cada conversación reciba siete criterios con razones y referencias a mensajes existentes.
- Que las evaluaciones se guarden y aparezcan una sola vez en el resumen vigente.
- Que los hallazgos y la falta de evidencia se distingan de una evaluación sin problemas observados.
- Que una persona pueda contrastar la explicación con los mensajes y registrar desacuerdo.

## Aspectos detectados para calibración comercial

1. **Límite del canal frente a error del agente.** En una consulta por tintas Epson T544, el evaluador penaliza no poder comprobar existencias en tienda. Hay que decidir si corresponde a una limitación del servicio, una oportunidad de mejora o una respuesta incorrecta. No implica por sí solo recomendar un producto inadecuado.
2. **Preferencias frente a requisitos mínimos.** En la conversación de portátiles, el cliente menciona i7 como preferido e i5 como mínimo. El agente anuncia buscar i7 y ofrece también i5. Debemos acordar cómo evaluar una alternativa que satisface el mínimo pero no la preferencia o la promesa del agente.
3. **Exactitud histórica.** Sin verificación del catálogo publicado a la hora de la conversación, no certificamos precio, disponibilidad o ficha técnica. Una nota alta con cobertura parcial no demuestra precisión del producto.

Estas son observaciones sobre el evaluador, no revisiones humanas registradas en nombre del equipo ni solicitudes enviadas a Yalo. Para comparar una rúbrica corregida, conservar esta versión como línea base y evaluar de nuevo los mismos casos.

## Ejecución

`scripts/evaluate_pending_sample.py` congela los 30 IDs autorizados en `.local/batch-30-targets.json`, omite resultados vigentes al reanudar y escribe un resumen técnico en `.local/batch-30-report.json`. Las respuestas HTTP 429 de Vertex AI motivaron reducir la ejecución a una conversación a la vez con espera progresiva.

## Resultado final del lote

Las 30 pendientes se completaron; quedan 31 conversaciones con evaluación real vigente y cero pendientes técnicas. Se comprobaron 217 criterios y que todas sus referencias apuntan a mensajes existentes. No se han registrado revisiones humanas.

| Clasificación del dashboard | Conversaciones |
| --- | ---: |
| Hallazgos críticos | 1 |
| Otros hallazgos | 5 |
| Sin incumplimientos detectados, con evidencia insuficiente | 22 |
| Sin hallazgos observados | 3 |

Se detectaron 11 incumplimientos de criterio: 5 en adecuación y 6 en resolución, distribuidos en 6 conversaciones. En 28 conversaciones la exactitud figura con evidencia insuficiente; incluye casos con hallazgos en otros criterios. Estas cuentas se superponen y no se suman como categorías excluyentes.

Prioridad de revisión: caso de portátil con presupuesto declarado de $1 millón y detalle posterior de producto a $1.899.070; validar también si corresponde la gravedad crítica. Revisar después los posibles falsos positivos descritos arriba antes de enviar solicitudes a Yalo.

Se recuperaron los errores de capacidad 429 mediante procesamiento secuencial y espera progresiva. La copia `.local/pilot-backup.dump` incluye los resultados del lote. La comprobación de referencias valida trazabilidad, no certifica por sí sola que el razonamiento de Gemini sea correcto.
