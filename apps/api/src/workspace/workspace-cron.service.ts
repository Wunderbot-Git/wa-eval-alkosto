import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { WorkspaceService } from './workspace.service'

// Daily import of yesterday's conversations from the shared BigQuery view,
// followed by the evaluation of the conversations worth judging.
// Both are opt-in (AUTO_IMPORT_DAILY, AUTO_EVALUATE_DAILY) and need their
// own access: BigQuery for the import, Gemini for the evaluation. On Cloud
// Run the API must keep at least one instance running (api_min_instances
// >= 1 in Terraform) or the schedule never fires and a batch started by
// the schedule is cut short.
@Injectable()
export class WorkspaceCronService {
  private readonly logger = new Logger(WorkspaceCronService.name)
  constructor(private readonly workspace: WorkspaceService) {}

  @Cron('0 0 6 * * *', { timeZone: 'America/Bogota' })
  async runDaily() {
    await this.importDaily()
    await this.evaluateDaily()
  }

  private async importDaily() {
    if (process.env.AUTO_IMPORT_DAILY !== 'true') return
    try {
      // Two days so one failed run heals itself the next morning (dedupe
      // makes the overlap free).
      const r = await this.workspace.importPreviousDay(2)
      this.logger.log(`Importación diaria ${r.from} → ${r.to}: ${r.added} eventos nuevos, ${r.duplicates} duplicados, ${r.sessions} conversaciones totales${r.processedBytes == null ? '' : `, ${(r.processedBytes / 1e6).toFixed(1)} MB procesados`}`)
    } catch (e) {
      this.logger.error(`Importación diaria falló: ${(e as Error).message}`)
    }
  }

  // Evaluates only the conversations that carry enough dialogue to judge
  // (see evaluationCandidacy). AUTO_EVALUATE_LIMIT caps the run so an
  // unusually large import cannot turn into an unexpected model bill.
  private async evaluateDaily() {
    if (process.env.AUTO_EVALUATE_DAILY !== 'true') return
    const cap = Number(process.env.AUTO_EVALUATE_LIMIT)
    try {
      const ids = await this.workspace.pendingCandidates(Number.isInteger(cap) && cap > 0 ? cap : 200)
      if (!ids.length) return this.logger.log('Evaluación diaria: no hay conversaciones aptas pendientes')
      const r = await this.workspace.evaluateBatch(ids)
      this.logger.log(`Evaluación diaria: ${r.done} evaluadas, ${r.failed} fallidas de ${r.total} aptas${r.lastError ? ` · último error: ${r.lastError}` : ''}`)
    } catch (e) {
      this.logger.error(`Evaluación diaria falló: ${(e as Error).message}`)
    }
  }
}
