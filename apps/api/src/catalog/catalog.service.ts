import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extract date from catalog filename.
   * Expected pattern: filtered_products_YYYYMMDD
   */
  extractDateFromFilename(filename: string): Date {
    const match = filename.match(/filtered_products_(\d{4})(\d{2})(\d{2})/)
    if (!match) {
      throw new BadRequestException(
        'Filename must match pattern: filtered_products_YYYYMMDD*',
      )
    }
    const [, year, month, day] = match
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  }

  /**
   * Sanitize raw JSON text: replace literal NaN with null.
   */
  sanitizeJson(text: string): string {
    return text.replace(/\bNaN\b/g, 'null')
  }

  /**
   * Parse catalog JSON, sanitizing NaN values.
   */
  parseCatalogJson(text: string): any[] {
    const sanitized = this.sanitizeJson(text)
    const parsed = JSON.parse(sanitized)
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Catalog file must contain a JSON array')
    }
    return parsed
  }

  async uploadCatalog(
    file: { originalname: string; buffer: Buffer },
    uploadedBy: string,
  ) {
    const catalogDate = this.extractDateFromFilename(file.originalname)
    const text = file.buffer.toString('utf-8')
    const products = this.parseCatalogJson(text)

    const catalog = await this.prisma.catalog.create({
      data: {
        filename: file.originalname,
        catalogDate,
        productCount: products.length,
        uploadedBy,
        products: {
          create: products.map((p) => ({
            externalId: String(p['Identificador del producto'] ?? ''),
            title: p['Título'] ?? '',
            listPrice: typeof p['Precio de lista'] === 'number' ? p['Precio de lista'] : null,
            salePrice: typeof p['Precio de venta'] === 'number' ? p['Precio de venta'] : null,
            paymentMethodPrice:
              p['Precio por método de pago'] != null
                ? String(p['Precio por método de pago'])
                : null,
            availability:
              typeof p['Disponibilidad'] === 'number'
                ? p['Disponibilidad']
                : null,
            category: p['Categoría'] ?? null,
            brand: p['Marca'] ?? null,
            rawData: p,
          })),
        },
      },
      include: { products: false },
    })

    return { ...catalog, productCount: products.length }
  }

  async findByDate(date: Date) {
    return this.prisma.catalog.findFirst({
      where: { catalogDate: date },
    })
  }

  async findAll() {
    return this.prisma.catalog.findMany({
      orderBy: { catalogDate: 'desc' },
    })
  }
}
