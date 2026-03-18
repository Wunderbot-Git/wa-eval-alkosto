# spec.md

## 1. Resumen

Este sistema permite evaluar **conversaciones reales terminadas** del agente de ventas de Yalo para Alkosto, usando como entrada un **archivo JSON con múltiples conversaciones** y uno o más **catálogos diarios versionados**. El sistema ejecuta una evaluación asíncrona por conversación mediante **LLM como juez**, produce resultados agregados y detallados, permite comparación entre corridas, habilita vistas de análisis profundo por conversación y soporta compartición de resultados con usuarios de Yalo en modo lectura.

El MVP está enfocado únicamente en **observación y evaluación de producción**, no en suites sintéticas ni pruebas repetibles.

---

## 2. Objetivos del sistema

### Objetivo principal
Medir la calidad de conversaciones reales del agente en producción, con foco en:

- calidad conversacional
- validación de integridad contra catálogo de referencia
- identificación de patrones y escenarios emergentes
- análisis agregado por corrida
- visibilidad compartida con Yalo

### Objetivos específicos
- Cargar manualmente un archivo JSON con múltiples conversaciones terminadas.
- Asociar automáticamente cada conversación con el catálogo correspondiente a su fecha.
- Evaluar cada conversación con jueces LLM especializados.
- Mostrar resultados agregados y detallados.
- Comparar la última corrida contra la corrida inmediatamente anterior.
- Permitir re-evaluación de subconjuntos de conversaciones.
- Compartir corridas o conversaciones con Yalo en modo lectura.
- Retener la información por 3 meses con exportación completa en JSON.

---

## 3. Alcance del MVP

### Incluye
- Login propio con correo y contraseña
- Gestión de usuarios por admin
- Dos roles funcionales visibles:
  - interno Alkosto
  - lector Yalo
- Carga manual de archivo JSON de conversaciones
- Carga de catálogos diarios versionados
- Evaluación asíncrona por corrida
- Resultado por conversación
- Dashboard de resumen
- Historial de corridas
- Vista detallada por conversación tipo WhatsApp
- Compartición con Yalo
- Exportación JSON por corrida completa
- Retención y borrado automático a 3 meses
- Re-evaluación de subconjuntos

### No incluye
- Gestión interna de incidentes
- Notificaciones automáticas
- Auditoría administrativa
- Descompartir contenido con Yalo
- Conservación del archivo fuente original
- Evaluación de adjuntos/imágenes
- Evals sintéticos o repetición del mismo caso
- Edición de test cases desde la UI
- CSV/Excel
- SSO
- Compartición granular por usuario Yalo

---

## 4. Usuarios y permisos

### 4.1 Roles funcionales

#### Interno Alkosto
Puede:
- iniciar sesión
- cargar corridas
- ejecutar evaluaciones
- ver dashboards y detalle completo
- compartir corridas o conversaciones con Yalo
- descargar exportaciones JSON
- re-evaluar subconjuntos

#### Lector Yalo
Puede:
- iniciar sesión
- ver únicamente lo compartido con Yalo
- consultar dashboards, detalle por conversación, hallazgos, transcripts y evidencias
- no puede editar, ejecutar, compartir, administrar usuarios ni modificar configuraciones

### 4.2 Usuario admin
Además de capacidades internas, puede:
- crear usuarios
- desactivar usuarios
- resetear contraseñas
- cambiar roles entre interno Alkosto y lector Yalo

Alta de usuarios:
- vía invitación por correo
- el usuario define su contraseña en el primer ingreso

---

## 5. Modelo operativo de evaluación

### 5.1 Unidad principal de evaluación
La unidad principal de evaluación es la **conversación completa**.

No se evalúa turno aislado como unidad final, aunque sí existe desglose analítico por mensaje dentro de la vista detallada.

### 5.2 Naturaleza de los datos
El sistema evalúa **conversaciones reales, únicas e irrepetibles** de producción.  
No aplica lógica de pass@3 ni pass^3 como regla central del MVP.

### 5.3 Módulos de evaluación del MVP
El framework se reorganiza en tres módulos:

1. **Integridad**
2. **Calidad Conversacional**
3. **Patrones/Escenarios**

---

## 6. Ingesta de datos

### 6.1 Conversaciones
Cada corrida se crea a partir de **un solo archivo JSON** que puede contener **múltiples conversaciones**.

### 6.2 Catálogo de referencia
El catálogo de referencia se carga como **archivo separado versionado**, normalmente con frecuencia máxima de una vez al día.

Cada conversación se evalúa contra el catálogo correspondiente a su fecha.

### 6.3 Posible integración futura
Se contempla como evolución futura una conexión con BigQuery para obtención de conversaciones, pero no es parte del MVP operativo.

---

## 7. Estructura del archivo de conversaciones

El sistema espera una **estructura JSON fija y estricta**.

### 7.1 Estructura lógica por conversación
Cada conversación debe ser autocontenida y traer:

- `session_id`
- `date`
- `messages`

### 7.2 Estructura lógica por mensaje
Cada mensaje debe incluir obligatoriamente:

- `role`
- `content` o `text`

Campos opcionales (pueden no estar presentes en los datos reales):

- `message_id` — si no existe, el sistema asigna el índice del mensaje en el array
- `timestamp` — si no existe, el orden del array determina la secuencia

### 7.3 Restricciones de mensaje
- `role` solo admite:
  - `customer`
  - `agent`
- `content/text` se trata como **texto plano**
- no se soportan adjuntos ni payloads enriquecidos en el MVP

### 7.4 Orden de mensajes
El orden del array de mensajes determina la secuencia de la conversación.
Si `timestamp` está presente, el sistema puede usarlo para validar el orden.

### 7.5 Manejo de conversaciones inválidas
Si algunas conversaciones no cumplen la estructura:
- el archivo completo **no se rechaza**
- la corrida se crea
- esas conversaciones quedan bajo el mismo estado visible de “no evaluada/no evaluable”, con motivo explícito

---

## 8. Fechas y zona horaria

### 8.1 Fecha de conversación
La fecha oficial de la conversación se toma desde su propio contenido, por ejemplo desde el valor `Date`.

### 8.2 Fecha del catálogo
La fecha del catálogo se obtiene del nombre del archivo, por ejemplo:

`filtered_products_20260128` → `2026-01-28`

### 8.3 Zona horaria oficial
La zona horaria oficial del sistema es **Colombia**.

### 8.4 Normalización interna
Todas las fechas y timestamps deben normalizarse internamente a un formato estándar tipo **ISO 8601**.

---

## 9. Asociación conversación-catálogo

### Regla principal
Cada conversación debe evaluarse contra el catálogo correspondiente a la fecha de esa conversación.

### Soporte multi-fecha en una corrida
Una misma corrida puede incluir conversaciones de fechas distintas.  
El sistema debe asociar automáticamente cada conversación al catálogo de su día.

### Si no existe catálogo para la fecha
La resolución de catálogo es por **coincidencia exacta de fecha** (no se busca el catálogo más cercano).

La conversación:
- no tumba la corrida
- queda marcada como no evaluada/no evaluable
- aparece en resultados con motivo explícito

---

## 10. Ejecución de corridas

### 10.1 Disparo
La evaluación se dispara manualmente por un usuario interno.

### 10.2 Estrategia de procesamiento
La corrida se ejecuta de forma **asíncrona**.

Arquitectura funcional:
- se crea una corrida padre
- se genera un job por conversación
- los jobs se procesan en paralelo con concurrencia limitada
- cada job ejecuta secuencialmente:
  1. Integridad
  2. Calidad Conversacional
  3. Patrones/Escenarios
  4. consolidación final

### 10.3 Estado agregado visible de la corrida
A nivel de UI, el progreso se muestra solo en forma agregada, por ejemplo:
- total de conversaciones
- procesadas
- pendientes
- no evaluadas

### 10.4 Fallos parciales
Si algunas conversaciones fallan técnicamente o no son evaluables:
- la corrida se completa parcialmente
- se indica cuáles no pudieron evaluarse y por qué

### 10.5 Cancelación
Una corrida en procesamiento puede cancelarse.

Regla del MVP:
- al cancelar, no se publican resultados
- la corrida no queda visible en historial
- operativamente se trata como si no hubiera existido para usuarios finales

---

## 11. Motivos de no evaluación

En el MVP existen 4 motivos de no evaluación por conversación:

1. **Sin catálogo para la fecha de la conversación**
2. **Error del juez LLM**
3. **Timeout de evaluación**
4. **Transcript inválido o no parseable**

Regla operativa:
- no cae toda la corrida
- la conversación queda marcada como no evaluada
- se muestra motivo explícito

---

## 12. Jueces LLM

### 12.1 Enfoque
La evaluación se realiza con **LLM como juez**.

### 12.2 Especialización
Se usan **tres jueces lógicos especializados**:

- juez de Integridad
- juez de Calidad Conversacional
- juez de Patrones/Escenarios

No implica necesariamente tres modelos distintos.  
Puede ser el mismo modelo base con prompts/rúbricas separadas.

### 12.3 Versionamiento
Cada juez tiene:
- prompt versionado
- rúbrica versionada

La versión usada por cada juez debe quedar registrada en cada snapshot de corrida.

### 12.4 Explicabilidad
Cuando el juez tome decisiones sensibles o excepcionales, debe entregar explicaciones breves y trazables en formato libre.

---

## 13. Módulo de Integridad

### 13.1 Definición
Integridad valida que las afirmaciones del agente sobre productos, precios y atributos sean consistentes con el catálogo/product feed asociado a la corrida.

### 13.2 Fuente de validación
Se evalúa contra:
- transcript de la conversación
- catálogo/product feed de referencia del día correspondiente

### 13.3 Qué valida
Incluye, entre otros:
- precio
- producto inexistente
- specs inconsistentes
- inventar atributos ausentes
- uso de catálogo desactualizado respecto a la fecha

### 13.4 Salida
Los hallazgos de Integridad se muestran separados por tipo, por ejemplo:
- precio
- producto inexistente
- spec inconsistente
- catálogo no disponible para la fecha

### 13.5 Severidad
La severidad **no es fija por tipo**.  
Puede ser:
- advertencia
- crítica

### 13.6 Regla compuesta de criticidad
Un hallazgo de Integridad puede ser crítico si cumple al menos una de estas condiciones:
- contradice la fuente de referencia en un dato material
- puede cambiar la decisión de compra
- afecta precio, disponibilidad o atributos esenciales
- genera apariencia clara de invención o no confiabilidad

### 13.7 Relación con el resultado final
Integridad produce hallazgos que alimentan al **juez consolidador**.

El consolidador es un cuarto paso LLM que recibe las salidas de los tres jueces (Integridad, Calidad Conversacional, Patrones/Escenarios) y decide:
- el **score final** (0.0–10.0)
- la **etiqueta final** (`aprobada`, `con hallazgos`, `fallida`)
- una **explicación** de la decisión

El consolidador tiene libertad para:
- empujar a `fallida` ante un hallazgo crítico de Integridad
- mantener `con hallazgos` si el contexto lo justifica (caso excepcional)
- ponderar los tres módulos según su criterio, siempre con explicación

Si algún juez falla (error LLM, timeout), el consolidador recibe `null` para ese módulo y debe producir un resultado igualmente, con una nota indicando la ausencia.

---

## 14. Módulo de Calidad Conversacional

### 14.1 Rol en el sistema
Es la dimensión más importante del MVP y define el **score principal** de la conversación.

### 14.2 Sub-scores visibles
Calidad Conversacional se compone de tres sub-scores:

1. **Entendimiento de la necesidad**
2. **Calidad de la recomendación**
3. **Fluidez/claridad**

### 14.3 Pesos
Por defecto, los tres sub-scores tienen **el mismo peso**.

Los pesos deben ser editables por el equipo técnico, pero **fuera de la app**.

---

## 15. Entendimiento de la necesidad

### Definición
Evalúa si el agente entendió correctamente lo que el usuario realmente necesita, privilegiando el **caso de uso** por encima de preguntas excesivamente técnicas, salvo que el usuario las vuelva centrales.

### Ejes de evaluación
1. **Caso de uso principal**
2. **Restricciones explícitas relevantes**
3. **Preferencias declaradas por el usuario**
4. **Capacidad de distinguir lo esencial de lo accesorio**

No existe un hallazgo automático por “no hacer suficientes preguntas”; eso vive dentro del score de este criterio.

---

## 16. Calidad de la recomendación

### Definición
Evalúa si, teniendo en cuenta la información disponible en la conversación, el juez también habría considerado razonables las recomendaciones del agente.

### Reglas clave
- No existe una única recomendación ideal obligatoria.
- Puede haber **más de un producto válido posible**.
- Si el agente recomienda un producto distinto al preferido por el juez, pero que está dentro del conjunto válido, se considera **totalmente correcto**.
- También se evalúan el **orden** y la **prioridad** de las recomendaciones.
- Debe evaluarse:
  - si la primera recomendación fue fuerte
  - y si el ranking global estuvo bien priorizado

### Límite de opciones
- máximo 3 recomendaciones
- si el agente recomienda más de 3 productos **sin que el usuario lo haya pedido explícitamente**, se marca **hallazgo automático**
- si el usuario sí pidió varias opciones, no hay problema por ese motivo

### Restricciones del usuario
No se penaliza automáticamente recomendar algo fuera de una restricción si el agente lo **justifica explícitamente** en la conversación.

Ejemplo válido:
- el usuario menciona un presupuesto máximo
- el agente recomienda algo más costoso
- pero explica claramente por qué esa opción es la única que cumple mejor las demás necesidades

Regla estricta:
- la justificación solo vale si el agente la dijo explícitamente
- el juez no puede inferirla por cuenta propia

### Objeciones
El manejo de objeciones se evalúa dentro de este criterio, no como criterio separado.

---

## 17. Fluidez/claridad en canal WhatsApp

### Definición
Evalúa si la conversación está adaptada a la naturaleza de WhatsApp como canal de mensajería.

### Debe considerar
- brevedad adecuada
- ritmo conversacional natural
- claridad inmediata
- fragmentación útil para móvil
- baja repetición
- tono cercano
- formato cómodo para WhatsApp

### Hallazgo automático
Si el juez detecta un mensaje demasiado largo o denso para WhatsApp:
- se marca **hallazgo automático**
- se referencia el mensaje puntual
- se agrega explicación breve de por qué no era adecuado para el canal

La determinación la hace el juez LLM según rúbrica; no hay umbral fijo de caracteres o líneas en el MVP.

---

## 18. Módulo de Patrones/Escenarios

### 18.1 Definición
Capa analítica para clasificar conversaciones por escenarios conocidos y detectar categorías emergentes.

### 18.2 Clasificación
La clasificación se hace por **inferencia automática** a partir del contenido de la conversación.

### 18.3 Taxonomía
Debe combinar:
- taxonomía base conocida
- detección de patrones emergentes no previstos

### 18.4 Incorporación de emergentes
Si el sistema detecta un nuevo patrón:
- se incorpora automáticamente
- queda visible de inmediato para todos los usuarios
- no requiere aprobación previa en el MVP

### 18.5 Explicabilidad
Cada patrón o escenario asignado debe incluir:
- breve explicación
- evidencias del transcript que sustentan la clasificación

### 18.6 Relación con la nota final
En el MVP, Patrones/Escenarios es **solo capa analítica** y **no impacta** la nota final de la conversación.

---

## 19. Resultado por conversación

### 19.1 Formato
Cada conversación evaluable debe tener:
- una **etiqueta final**
- un **score numérico**

### 19.2 Etiquetas finales
- `aprobada`
- `con hallazgos`
- `fallida`

### 19.3 Escala numérica
Score de `0.0 a 10.0`, con un decimal.

### 19.4 Umbrales
- `aprobada`: `8.5 a 10.0`
- `con hallazgos`: `6.0 a 8.4`
- `fallida`: `< 6.0`

### 19.5 Lógica de cálculo
El score y la etiqueta final los determina el **juez consolidador** (cuarto paso LLM), que recibe las salidas de Integridad, Calidad Conversacional y Patrones/Escenarios.

La nota principal se basa en **Calidad Conversacional**, pero el consolidador puede ajustarla según hallazgos de Integridad. Patrones/Escenarios es información analítica que el consolidador usa como contexto adicional, sin impacto directo en el score en el MVP.

### 19.6 Estado unificado de no evaluación
Conversaciones no evaluables o inválidas comparten un mismo estado visible, con motivo explícito.

---

## 20. Snapshot histórico

Cada corrida completada debe generar un **snapshot histórico inmutable**.

### Debe almacenar como mínimo
- resultados agregados
- detalle por conversación
- scores por criterio
- evidencias
- transcript completo evaluado
- versión de archivos de evaluación
- versiones de prompts/rúbricas por juez
- timestamp
- catálogos asociados
- pesos/configuración aplicada

### Regla sobre transcript
El transcript se conserva dentro del snapshot.

### Regla de anonimización
Solo deben anonimizarse números telefónicos, ocultando las **3 cifras centrales** antes de persistir o mostrar el contenido.

No se anonimiza automáticamente ningún otro dato en el MVP.

### Re-evaluación
El snapshot original es inmutable, pero el sistema debe permitir **re-evaluar** una corrida histórica o un subconjunto de conversaciones, generando **una nueva corrida derivada**.

---

## 21. Re-evaluación

### 21.1 Alcance
Puede aplicarse a:
- una corrida histórica completa
- un subconjunto filtrado de conversaciones

### 21.2 Filtros mínimos para re-evaluación por subconjunto
- estado final
- tipo/severidad de hallazgo
- módulo/criterio
- fecha de conversación
- patrón/escenario detectado

### 21.3 Resultado
Toda re-evaluación produce una **nueva corrida**, sin sobrescribir la original.

---

## 22. Vistas del producto

### 22.1 Dashboard principal
Abre por defecto con la **última corrida disponible**.

Debe permitir:
- subir un nuevo archivo para crear corrida
- ir al historial de corridas

### 22.2 Contenido mínimo del dashboard resumen
- estado general de la última corrida
- score agregado de calidad conversacional
- distribución de resultados (`aprobadas`, `con hallazgos`, `fallidas`, `no evaluadas`)
- métricas de integridad destacadas
- métricas de calidad conversacional
- acceso a conversaciones destacadas
- comparación contra la corrida inmediatamente anterior
- comparación por módulo/tipo de evaluación analítica
- patrones o hallazgos emergentes relevantes

### 22.3 Comparación entre corridas
La comparación principal es siempre contra la **corrida inmediatamente anterior**.

Como las conversaciones son únicas y distintas en cada corrida:
- no se compara conversación contra conversación
- se comparan métricas agregadas, distribuciones y patrones

La comparación prioritaria se hace por tipo/módulo de evaluación.

### 22.4 Historial de corridas
Columnas recomendadas del MVP:
- fecha y hora de ejecución
- identificador/nombre de corrida
- estado
- total de conversaciones
- evaluadas
- no evaluadas
- score agregado de calidad conversacional
- distribución de resultados
- fecha de expiración
- compartida con Yalo (`sí/no`)

### 22.5 Nombre automático de corrida
Nombre generado automáticamente y fijo:
- identificador técnico simple
- más fecha de ejecución

---

## 23. Vista detallada por conversación

### Estructura principal
#### Panel izquierdo
- conversación completa en UI tipo WhatsApp

#### Panel derecho
- evaluación estructurada por criterio
- hallazgos críticos
- explicaciones
- interpretación del mensaje del usuario usada por el juez

### Organización del panel derecho
Se organiza por criterio, no por mensaje:
- Integridad
- Entendimiento de la necesidad
- Calidad de la recomendación
- Fluidez/claridad
- Patrones/Escenarios

### Navegación cruzada
Al hacer clic en un hallazgo o evidencia del panel derecho:
- se resalta o lleva al fragmento correspondiente de la conversación en el panel izquierdo

### Desglose por mensaje
Debe existir **desglose completo de evaluación por mensaje del agente**, acompañado por la interpretación del mensaje del usuario que el juez utilizó como contexto.

---

## 24. Compartición con Yalo

### 24.1 Regla general
El acceso Yalo funciona a nivel de organización:
- todo lo compartido con Yalo lo ven todos los usuarios de Yalo

### 24.2 Niveles de compartición
Se puede compartir:
- una corrida completa
- una conversación individual

### 24.3 Herencia
Si se comparte una corrida:
- se comparten también todas sus conversaciones

### 24.4 Forma de compartir
La acción debe estar disponible directamente desde:
- vista de corrida
- vista de conversación

Además, puede existir una vista/listado simple de “Compartido con Yalo”.

### 24.5 UX del compartir
- sin comentario obligatorio
- sin confirmación adicional
- acción directa

### 24.6 Restricción del MVP
No existe acción de descompartir en esta versión.

---

## 25. Exportación y retención

### 25.1 Retención
Toda la información se conserva por **3 meses**.

### 25.2 Expiración visible
La UI debe mostrar la **fecha exacta de expiración** de cada corrida.

### 25.3 Exportación
Antes de la expiración, cualquier usuario interno puede descargar una exportación completa de la corrida en **JSON**.

### 25.4 Alcance de exportación
Solo se exporta por **corrida completa**.

### 25.5 Contenido de exportación
Debe incluir:
- conversaciones completas
- transcripts
- scores
- hallazgos
- evidencias
- metadatos de corrida
- resultados agregados
- configuración exacta usada
- versiones de prompts/rúbricas
- pesos
- catálogos asociados
- fecha de ejecución

No es necesario incluir información de compartición con Yalo.

### 25.6 Borrado
Al cumplir los 3 meses:
- eliminación automática
- tanto de resultados como de archivos asociados en storage

---

## 26. Almacenamiento

Los archivos y artefactos del sistema deben almacenarse en **almacenamiento de objetos en la nube**.

Incluye:
- catálogos diarios
- exportaciones
- artefactos persistidos del procesamiento

No se conserva el archivo fuente original subido por el usuario; se persiste el modelo interno ya parseado/evaluado.

---

## 27. Requisitos no funcionales

### 27.1 Trazabilidad
Toda conversación evaluada debe poder rastrearse hasta:
- su session_id
- su fecha
- su catálogo asociado
- la versión de jueces/prompts/rúbricas
- la corrida que la produjo

### 27.2 Explicabilidad
Toda decisión importante del juez debe poder explicarse de forma legible y con evidencia.

### 27.3 Escalabilidad del MVP
El sistema debe soportar corridas de:
- decenas
- cientos de conversaciones

### 27.4 Tolerancia a fallos
Debe soportar fallos parciales sin perder la corrida completa.

### 27.5 Seguridad básica
- autenticación con correo y contraseña
- autorización por rol
- acceso compartido controlado para Yalo
- anonimización parcial de teléfonos

---

## 28. Diagramas

### 28.1 Flujo principal de corrida

```text
[Usuario interno]
      |
      v
[Carga JSON conversaciones]
      |
      v
[Validación estructural por conversación]
      |
      +------------------------------+
      |                              |
      v                              v
[Conversación válida]          [Conversación no evaluada]
      |                         motivo explícito
      v
[Asociar fecha conversación]
      |
      v
[Resolver catálogo del día]
      |
      +------------------------------+
      |                              |
      v                              v
[Catálogo encontrado]          [Sin catálogo]
      |                         no evaluada
      v
[Job asíncrono por conversación]
      |
      v
[Integridad]
      |
      v
[Calidad Conversacional]
      |
      v
[Patrones/Escenarios]
      |
      v
[Consolidación resultado]
      |
      v
[Agregación corrida]
      |
      v
[Dashboard + historial + detalle]
```

### 28.2 Evaluación por conversación

```text
                    +-------------------------+
Transcript -------->|  Juez Integridad        |----+
Catálogo del día -->|  (contra feed diario)   |    |
                    +-------------------------+    |
                                                   v
                    +-------------------------+  [Consolidación]
Transcript -------->|  Juez Calidad           |----+
                    |  - Entendimiento        |
                    |  - Recomendación        |
                    |  - Fluidez WhatsApp     |
                    +-------------------------+

                    +-------------------------+
Transcript -------->|  Juez Patrones          |----+
                    |  - Taxonomía base       |
                    |  - Emergentes           |
                    +-------------------------+
```

### 28.3 Vista detallada

```text
+------------------------------------------------+--------------------------------------+
| Conversación completa (UI tipo WhatsApp)       | Evaluación por criterio              |
|                                                |                                      |
| [msg user]                                     | Integridad                           |
| [msg assistant]                                | - hallazgos por tipo                 |
| [msg user]                                     | - severidad                          |
| [msg assistant]                                |                                      |
|                                                | Entendimiento de la necesidad        |
| <-- al hacer click en hallazgo se resalta -->  | Calidad de la recomendación          |
|     el fragmento asociado en este panel        | Fluidez/claridad                     |
|                                                | Patrones/Escenarios                  |
|                                                |                                      |
|                                                | Hallazgos críticos                   |
|                                                | Evidencias y explicación breve       |
+------------------------------------------------+--------------------------------------+
```

---

## 29. Reglas clave consolidadas

```text
1. El sistema evalúa conversaciones reales terminadas, no pruebas sintéticas.
2. Cada conversación completa es la unidad principal de evaluación.
3. Calidad Conversacional es la dimensión principal del score.
4. Integridad funciona como gate contextual pasar/fallar.
5. Patrones/Escenarios es analítico y no impacta la nota final del MVP.
6. Cada conversación se evalúa contra el catálogo de su fecha.
7. Si no hay catálogo, queda no evaluada, no cae la corrida.
8. La corrida se ejecuta asíncronamente con jobs por conversación.
9. La corrida puede completarse parcialmente.
10. Si se cancela, no publica nada y no queda visible.
11. Solo se comparten corridas/conversaciones explícitamente con Yalo.
12. Todo lo compartido con Yalo lo ve todo Yalo.
13. Retención de 3 meses con exportación JSON por corrida completa.
14. Solo se anonimiza teléfono, ocultando 3 cifras centrales.
15. Toda re-evaluación genera una nueva corrida derivada.
```

---

## 30. Open questions cerrados para este MVP

Quedan definidos así:

- acceso Yalo: solo lectura
- compartición: explícita
- comparación: contra corrida inmediatamente anterior
- nombre de corrida: automático y fijo
- exportación: JSON
- almacenamiento: objetos en nube
- login: correo + contraseña
- admin: crea/desactiva/reset/cambia rol
- auditoría admin: no en MVP
- incidentes: no en MVP
- notificaciones: no en MVP
- descompartir: no en MVP
- adjuntos: no en MVP
- archivo original: no conservar
- límite de tamaño: configurable, no fijo en spec

---

## 31. Criterio de aceptación del MVP

El MVP se considera funcional cuando permite:

1. Crear usuarios y acceder al sistema con roles válidos.
2. Cargar un archivo JSON estricto con múltiples conversaciones.
3. Asociar automáticamente cada conversación a su catálogo por fecha.
4. Ejecutar una corrida asíncrona con resultados parciales tolerantes a fallos.
5. Evaluar cada conversación con jueces LLM especializados.
6. Mostrar score, etiqueta, hallazgos, evidencias y transcript.
7. Navegar una vista detallada tipo WhatsApp con evaluación enlazada.
8. Mostrar dashboard de última corrida e historial.
9. Comparar la corrida actual con la inmediatamente anterior.
10. Compartir corridas o conversaciones con Yalo.
11. Re-evaluar subconjuntos.
12. Exportar una corrida completa en JSON.
13. Eliminar automáticamente datos al cumplir 3 meses.
