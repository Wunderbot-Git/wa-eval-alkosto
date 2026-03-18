import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CatalogService } from './catalog.service'
import { BadRequestException } from '@nestjs/common'

function makePrismaStub() {
  return {
    catalog: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  }
}

describe('CatalogService', () => {
  let service: CatalogService
  let prisma: ReturnType<typeof makePrismaStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    service = new CatalogService(prisma as any)
  })

  describe('extractDateFromFilename', () => {
    it('should extract date from valid filename', () => {
      const date = service.extractDateFromFilename(
        'filtered_products_20260128_080002.json',
      )
      expect(date.getFullYear()).toBe(2026)
      expect(date.getMonth()).toBe(0) // January = 0
      expect(date.getDate()).toBe(28)
    })

    it('should extract date from filename without extra parts', () => {
      const date = service.extractDateFromFilename(
        'filtered_products_20251215.json',
      )
      expect(date.getFullYear()).toBe(2025)
      expect(date.getMonth()).toBe(11) // December = 11
      expect(date.getDate()).toBe(15)
    })

    it('should throw for invalid filename', () => {
      expect(() =>
        service.extractDateFromFilename('some_random_file.json'),
      ).toThrow(BadRequestException)
    })
  })

  describe('sanitizeJson', () => {
    it('should replace NaN with null', () => {
      const input = '{"price": NaN, "name": "NaN Corp", "val": NaN}'
      const result = service.sanitizeJson(input)
      expect(result).toBe('{"price": null, "name": "null Corp", "val": null}')
    })

    it('should not modify valid JSON without NaN', () => {
      const input = '{"price": 100, "name": "test"}'
      expect(service.sanitizeJson(input)).toBe(input)
    })
  })

  describe('parseCatalogJson', () => {
    it('should parse valid JSON array', () => {
      const input = '[{"Identificador del producto": 123}]'
      const result = service.parseCatalogJson(input)
      expect(result).toEqual([{ 'Identificador del producto': 123 }])
    })

    it('should handle NaN values in JSON', () => {
      const input = '[{"price": NaN, "name": "test"}]'
      const result = service.parseCatalogJson(input)
      expect(result).toEqual([{ price: null, name: 'test' }])
    })

    it('should throw for non-array JSON', () => {
      expect(() => service.parseCatalogJson('{"key": "value"}')).toThrow(
        BadRequestException,
      )
    })

    it('should throw for invalid JSON', () => {
      expect(() => service.parseCatalogJson('not json')).toThrow()
    })
  })

  describe('uploadCatalog', () => {
    it('should create catalog and products', async () => {
      const products = [
        {
          'Identificador del producto': 12345,
          'Título': 'Test Product',
          'Precio de lista': 1000,
          'Precio de venta': 800,
          'Precio por método de pago': 'tarjeta:750',
          'Disponibilidad': 10,
          'Categoría': 'Electronics',
          'Marca': 'TestBrand',
        },
      ]
      const fileBuffer = Buffer.from(JSON.stringify(products))
      const file = {
        originalname: 'filtered_products_20260128_080002.json',
        buffer: fileBuffer,
      }

      prisma.catalog.create.mockResolvedValue({
        id: 'cat-1',
        filename: file.originalname,
        catalogDate: new Date(2026, 0, 28),
        productCount: 1,
        uploadedBy: 'user-1',
        createdAt: new Date(),
      })

      const result = await service.uploadCatalog(file, 'user-1')
      expect(result.productCount).toBe(1)
      expect(prisma.catalog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            filename: file.originalname,
            productCount: 1,
            uploadedBy: 'user-1',
            products: {
              create: [
                expect.objectContaining({
                  externalId: '12345',
                  title: 'Test Product',
                  listPrice: 1000,
                  salePrice: 800,
                  paymentMethodPrice: 'tarjeta:750',
                  availability: 10,
                  category: 'Electronics',
                  brand: 'TestBrand',
                }),
              ],
            },
          }),
        }),
      )
    })

    it('should handle products with NaN values', async () => {
      const rawJson = '[{"Identificador del producto": 999, "Título": "NaN Test", "Precio de lista": NaN, "Precio de venta": 500, "Precio por método de pago": NaN, "Disponibilidad": NaN, "Categoría": "Cat", "Marca": "Brand"}]'
      const file = {
        originalname: 'filtered_products_20260201.json',
        buffer: Buffer.from(rawJson),
      }

      prisma.catalog.create.mockResolvedValue({
        id: 'cat-2',
        filename: file.originalname,
        catalogDate: new Date(2026, 1, 1),
        productCount: 1,
        uploadedBy: 'user-1',
        createdAt: new Date(),
      })

      const result = await service.uploadCatalog(file, 'user-1')
      expect(result.productCount).toBe(1)
      expect(prisma.catalog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            products: {
              create: [
                expect.objectContaining({
                  listPrice: null,
                  salePrice: 500,
                  paymentMethodPrice: null,
                  availability: null,
                }),
              ],
            },
          }),
        }),
      )
    })
  })

  describe('findByDate', () => {
    it('should query by exact date', async () => {
      const date = new Date(2026, 0, 28)
      prisma.catalog.findFirst.mockResolvedValue({
        id: 'cat-1',
        catalogDate: date,
      })

      const result = await service.findByDate(date)
      expect(result).toBeDefined()
      expect(prisma.catalog.findFirst).toHaveBeenCalledWith({
        where: { catalogDate: date },
      })
    })

    it('should return null when no catalog exists for the date', async () => {
      const date = new Date(2026, 0, 29)
      prisma.catalog.findFirst.mockResolvedValue(null)

      const result = await service.findByDate(date)
      expect(result).toBeNull()
      expect(prisma.catalog.findFirst).toHaveBeenCalledWith({
        where: { catalogDate: date },
      })
    })

    it('should find catalog for a specific date among multiple catalogs', async () => {
      const jan28 = new Date(2026, 0, 28)
      const feb01 = new Date(2026, 1, 1)

      // First call for Jan 28 returns a catalog
      prisma.catalog.findFirst.mockResolvedValueOnce({
        id: 'cat-jan28',
        catalogDate: jan28,
      })

      // Second call for Feb 1 returns a different catalog
      prisma.catalog.findFirst.mockResolvedValueOnce({
        id: 'cat-feb01',
        catalogDate: feb01,
      })

      const result1 = await service.findByDate(jan28)
      expect(result1).toEqual({ id: 'cat-jan28', catalogDate: jan28 })

      const result2 = await service.findByDate(feb01)
      expect(result2).toEqual({ id: 'cat-feb01', catalogDate: feb01 })

      expect(prisma.catalog.findFirst).toHaveBeenCalledTimes(2)
    })
  })

  describe('findAll', () => {
    it('should return catalogs ordered by date desc', async () => {
      prisma.catalog.findMany.mockResolvedValue([])
      await service.findAll()
      expect(prisma.catalog.findMany).toHaveBeenCalledWith({
        orderBy: { catalogDate: 'desc' },
      })
    })
  })
})
