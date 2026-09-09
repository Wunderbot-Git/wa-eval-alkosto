import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { WorkspaceService } from './workspace.service'

// Daily import of yesterday's conversations from the shared BigQuery view.
// Opt-in via AUTO_IMPORT_DAILY=true; needs BigQuery access (ADC or local
// gcloud mode). On Cloud Run the API must keep at least one instance running
// (api_min_instances >= 1 in Terraform) or the schedule never fires.
@Injectable()
export class WorkspaceCronService {
  private readonly logger = new Logger(WorkspaceCronService.name)
  constructor(private readonly workspace: WorkspaceService) {}

  @Cron('0 0 6 * * *', { timeZone: 'America/Bogota' })
  async importDaily() {
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
}
