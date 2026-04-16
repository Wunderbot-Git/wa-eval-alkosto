# todo_changes.md

Granular checklist derived from `plan_changes.md`. Mirrors the style of `todo.md`.

## Hitos de alto nivel

- [ ] Fase 1: Conjunto de calibración (baseline)
- [ ] Fase 2: Cerrar brecha #8 — information_gathering
- [ ] Fase 3: Consolidador determinístico
- [ ] Fase 4: Brechas restantes de rúbrica (#5, #7, #2, #3)
- [ ] Fase 5: Quick wins técnicos
- [ ] Fase 6: Mediano plazo
- [ ] Fase 7: Refresco de documentación

---

## Tareas granulares

### Fase 1: Baseline de calibración

- [ ] Seleccionar 20 conversaciones reales que cubran el espectro (aprobada / con_hallazgos / fallida)
- [ ] Incluir edge cases: muy cortas, muy largas, sin recomendación, comparación multi-producto
- [ ] Crear carpeta `apps/api/calibration/v1/` con los JSON de conversaciones
- [ ] Etiquetar a mano cada conversación en las 9 dimensiones (escala 1–5) en `labels.csv`
- [ ] Documentar metodología de etiquetado en `apps/api/calibration/v1/README.md`
- [ ] Correr el sistema actual con Gemini contra ese set, guardar resultados
- [ ] Calcular acuerdo por dimensión entre etiquetas humanas y sistema actual
- [ ] Registrar baseline numérico (criterio de éxito para fases siguientes)

### Fase 2: Cerrar brecha #8 (information_gathering)

- [ ] Redactar sub-score `information_gathering` (0–10) en `apps/api/prompts/quality/system.md`
- [ ] Definir criterios explícitos: ¿preguntó use_case, budget, dealbreakers antes de recomendar?
- [ ] Extender `QualityJudgeResult.subScores` en `apps/api/src/judges/judge.interfaces.ts`
- [ ] Actualizar `FakeQualityJudge` para emitir el nuevo sub-score determinísticamente
- [ ] Actualizar `GeminiQualityJudge` y su esquema JSON de salida
- [ ] Actualizar normalización/clamp en `apps/api/src/evaluation/quality/quality.service.ts`
- [ ] Verificar que `Evaluation.qualitySubScores` (Json) persiste el nuevo campo sin migración
- [ ] Renderizar el nuevo sub-score en el panel de evaluación (`apps/web/src/app/runs/[id]/conversations/[id]/`)
- [ ] Actualizar tests: `quality.service.spec.ts`, `fake-quality.judge.spec.ts`, `consolidator.service.spec.ts`
- [ ] Correr calibración y comparar agreement vs baseline
- [ ] Confirmar que los 248 tests siguen pasando

### Fase 3: Consolidador determinístico

- [ ] Crear `apps/api/src/evaluation/consolidator/score-calculator.ts` como función pura
- [ ] Implementar reglas: -2.0/CRITICAL integridad, -0.5/WARNING integridad
- [ ] Implementar reglas: -1.5/CRITICAL recomendación, -0.4/WARNING recomendación
- [ ] Implementar cap 5.9 ante cualquier CRITICAL
- [ ] Implementar thresholds de etiqueta: aprobada ≥8.5, con_hallazgos 6.0–8.49, fallida <6.0
- [ ] Llamar al calculator desde `consolidator.service.ts` antes de invocar al juez
- [ ] Reescribir `apps/api/prompts/consolidator/system.md` para pedir solo explicación en prosa
- [ ] Reescribir `apps/api/prompts/consolidator/user.md` para pasar score + label ya computados
- [ ] Actualizar `FakeConsolidatorJudge` a solo generar explicación
- [ ] Actualizar `GeminiConsolidatorJudge` a solo generar explicación
- [ ] Ajustar `ConsolidatorResult` si la interfaz debe cambiar (score/label ahora vienen del calculator)
- [ ] Escribir tests exhaustivos del calculator (una prueba por rama: cap, thresholds, clamp)
- [ ] Actualizar tests del consolidator para reflejar el nuevo contrato
- [ ] Correr calibración; verificar que las etiquetas no se hayan movido inesperadamente
- [ ] Confirmar que los 248+ tests siguen pasando

### Fase 4: Brechas restantes de rúbrica

#### 4a. #5 Conciseness

- [ ] Agregar sub-score `conciseness` (0–10) en `apps/api/prompts/quality/system.md`
- [ ] Incluir ejemplos de "cálido pero conciso" vs "demasiado verboso"
- [ ] Extender `QualityJudgeResult.subScores` con `conciseness`
- [ ] Actualizar fake/Gemini quality judges y tests
- [ ] Renderizar en el panel de evaluación
- [ ] Correr calibración; comparar agreement en dimensión #5

#### 4b. #7 Sparse needs + confident recommendation

- [ ] Agregar tipo de finding `recommended_without_sufficient_info` en `apps/api/prompts/recommendation/system.md`
- [ ] Definir trigger: se hizo recomendación y `statedNeeds` carece de `use_case` y `budget`
- [ ] Actualizar enum/tipo de finding types en el código si aplica
- [ ] Actualizar fake/Gemini recommendation judges
- [ ] Agregar tests
- [ ] Correr calibración; comparar agreement en dimensión #7

#### 4c. #2 Naturalness

- [ ] Agregar patrón emergente `robotic_phrasing` en `apps/api/prompts/pattern/system.md`
- [ ] Actualizar fake/Gemini pattern judges y tests
- [ ] Correr calibración; comparar agreement en dimensión #2
- [ ] Decidir con datos si es necesario un sub-score dedicado además del patrón

#### 4d. #3 Coherence

- [ ] Agregar patrón `topic_jumps` en `apps/api/prompts/pattern/system.md`
- [ ] Actualizar fake/Gemini pattern judges y tests
- [ ] Correr calibración; comparar agreement en dimensión #3
- [ ] Decidir con datos si es necesario un sub-score dedicado

### Fase 5: Quick wins técnicos

- [ ] Reemplazar loops por `createMany` en `apps/api/src/runs/run.service.ts` L46–77
- [ ] Agregar índice en `Message.role` (migración Prisma)
- [ ] Agregar índice en `Finding.severity` (migración Prisma)
- [ ] Agregar índice en `Run.expiresAt` (migración Prisma)
- [ ] Configurar redacción pino para `*_API_KEY` y `Authorization`
- [ ] Ampliar regex de anonimización telefónica en `apps/api/src/export/export.service.ts` L16
- [ ] Agregar guard de tamaño en `conversation-parser.service.ts` antes de `JSON.parse`
- [ ] Eliminar `any` en `export.service.ts` L24, L32
- [ ] Eliminar `any` en `run.service.ts` L393
- [ ] Eliminar `any` en `evaluation.worker.ts` L142
- [ ] Confirmar que todos los tests siguen pasando

### Fase 6: Mediano plazo

- [ ] Diseñar adaptador GCS para artefactos de exportación
- [ ] Mover `exportJob.filePath` de columna DB a storage externo
- [ ] Agregar tests de integración HTTP para `CatalogController`
- [ ] Agregar tests de integración HTTP para `ExportController`
- [ ] Agregar tests de integración HTTP para `InvitationController`
- [ ] Agregar tests de integración HTTP para `ReevaluationController`
- [ ] Agregar tests de integración HTTP para `RetentionController`
- [ ] Agregar tests de integración HTTP para `RunController`
- [ ] Agregar tests de integración HTTP para `SharingController`
- [ ] Agregar tests de integración HTTP para `UserController`
- [ ] Revisar alcance de `GET /sharing/runs` para YALO_READER (scope por usuario o token efímero)
- [ ] Opcional: smoke test de Gemini real, gated por env var

### Fase 7: Refresco de documentación

- [ ] Actualizar `CLAUDE.md` §"Four LLM Judges" → cinco jueces + consolidador
- [ ] Documentar la cadena extraction → recommendation
- [ ] Actualizar `summary.md` con sub-scores nuevos, consolidador determinístico y baseline de calibración
- [ ] Crear `apps/api/prompts/README.md` con mapping rúbrica ↔ dimensiones de cliente
- [ ] Actualizar este `todo_changes.md` con estado final

---

## Criterios de listo por fase

### Fase 1
- [ ] 20 conversaciones etiquetadas a mano en las 9 dimensiones
- [ ] Baseline numérico de agreement documentado

### Fase 2
- [ ] Sub-score `information_gathering` visible en UI y persistido
- [ ] Agreement en dimensión #8 medible (subió vs baseline)
- [ ] 248+ tests pasando

### Fase 3
- [ ] Mismos inputs de juez producen siempre el mismo score/label
- [ ] Juez consolidador solo genera explicación
- [ ] Labels de calibración no regresionaron

### Fase 4
- [ ] Agreement mejora en #5, #7, #2, #3 vs baseline

### Fase 5
- [ ] Sin `any` en los 3 hotspots señalados
- [ ] Índices agregados y migraciones aplicadas
- [ ] Sin API keys visibles en logs de prueba

### Fase 6
- [ ] Exportación grande no guarda JSON en DB
- [ ] Todos los controllers con al menos un test de integración

### Fase 7
- [ ] Docs coinciden con el código
