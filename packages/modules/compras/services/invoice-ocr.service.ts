/**
 * Invoice OCR Service
 * Handles invoice data extraction using pdf-parse + OpenAI Vision
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { z } from 'zod';
import { creditUsageService } from '../../../services/credit-usage';

// pdf-parse uses CommonJS exports, lazy load with proper typing
let pdfParse: ((dataBuffer: Buffer) => Promise<{ text: string }>) | null = null;

async function getPdfParse() {
  if (!pdfParse) {
    // Dynamic import for pdf-parse (CommonJS module)
    const module = await import('pdf-parse') as any;
    // pdf-parse exports as default in CJS, handle both cases
    pdfParse = typeof module.default === 'function' ? module.default : module;
  }
  if (!pdfParse) {
    throw new Error('Failed to load pdf-parse module');
  }
  return pdfParse;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types & Schemas
// ═══════════════════════════════════════════════════════════════════════════════

export interface InvoiceOcrResult {
  success: boolean;
  data?: {
    invoiceNumber: string;
    invoiceDate: string; // YYYY-MM-DD format
    supplierName: string;
    supplierTaxId: string; // NIF/Tax ID
    totalAmount: number;
    currency?: string;
    lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    confidence: number; // 0-1
    extractionMethod: 'pdf-parse+openai' | 'openai-vision';
  };
  error?: string;
}

// Zod schema for OCR data validation
const invoiceLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number(),
  total: z.number(),
});

const invoiceOcrSchema = z.object({
  invoiceNumber: z.string(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  supplierName: z.string(),
  supplierTaxId: z.string(),
  totalAmount: z.number().positive(),
  currency: z.enum(['EUR', 'USD', 'GBP']).optional(),
  lineItems: z.array(invoiceLineItemSchema),
  confidence: z.number().min(0).max(1),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_PDF_EXTENSIONS = ['.pdf'];
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const ALLOWED_EXTENSIONS = [...ALLOWED_PDF_EXTENSIONS, ...ALLOWED_IMAGE_EXTENSIONS];

interface CreditContext {
  tenantId: string;
  userId: string;
  environment: 'production' | 'sandbox';
}

async function recordOpenAIUsage(
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
  creditContext: CreditContext,
  details: { service: string; operation: string; metadata?: Record<string, any> }
) {
  if (!usage || (!usage.prompt_tokens && !usage.completion_tokens)) {
    return;
  }

  try {
    await creditUsageService.trackModelUsage({
      tenantId: creditContext.tenantId,
      userId: creditContext.userId,
      provider: 'openai',
      service: details.service,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      environment: creditContext.environment,
      metadata: {
        operation: details.operation,
        ...details.metadata,
      },
    });
  } catch (error) {
    // ⚠️ NOTE: This should rarely happen since we check credits before the operation
    console.error('[InvoiceOCR] Failed to track credit usage (post-operation):', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OpenAI Client (Lazy-loaded)
// ═══════════════════════════════════════════════════════════════════════════════

let _openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        'OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable to use OCR features.'
      );
    }
    _openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openaiClient;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Export Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @deprecated This function is LEGACY and only works with LOCAL FILE PATHS.
 * 
 * For Supabase Storage files, use:
 * - assistDOCS Orchestrator (recommended)
 * - FileStorageService.getFileBuffer() to get buffer, then process
 * 
 * This function will fail for files stored in Supabase Storage.
 * It's kept for backward compatibility with local uploads only.
 */
export async function extractInvoiceData(params: {
  filePath: string;
  tenantId: string;
  userId?: string;
  environment?: 'sandbox' | 'production';
}): Promise<InvoiceOcrResult> {
  const { filePath, tenantId } = params;
  const userId = params.userId || 'system';
  const environment = params.environment || 'production';
  const creditContext: CreditContext = { tenantId, userId, environment };

  // 💳 PRE-FLIGHT CREDIT CHECK: Block operation if insufficient credits
  try {
    await creditUsageService.checkSufficientCredits(tenantId, 1);
  } catch (error) {
    console.error('[InvoiceOCR] ❌ BLOCKED: Insufficient credits', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Insufficient credits to process invoice',
    };
  }

  try {
    // 1. Validate file path (prevent directory traversal)
    const normalizedPath = path.normalize(filePath);
    const resolvedPath = path.resolve(normalizedPath);
    
    // Ensure file path is within allowed uploads directory (strict check)
    const allowedUploadsRoot = path.resolve(process.cwd(), 'uploads');
    if (!resolvedPath.startsWith(allowedUploadsRoot)) {
      return {
        success: false,
        error: 'Invalid file path: must be within uploads directory',
      };
    }

    // 2. Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    // 3. Validate file extension
    const fileExt = path.extname(resolvedPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
      return {
        success: false,
        error: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
      };
    }

    // 4. Read file and validate size
    const fileBuffer = fs.readFileSync(resolvedPath);
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      };
    }

    // 5. Extract data based on file type
    let extractedData: any;
    let extractionMethod: 'pdf-parse+openai' | 'openai-vision';

    if (ALLOWED_PDF_EXTENSIONS.includes(fileExt)) {
      // PDF: Use pdf-parse + OpenAI
      extractedData = await extractFromPDF(fileBuffer, creditContext);
      extractionMethod = 'pdf-parse+openai';
    } else {
      // Image: Use OpenAI Vision
      extractedData = await extractFromImage(fileBuffer, fileExt, creditContext);
      extractionMethod = 'openai-vision';
    }

    // 6. Validate extracted data with Zod
    const validated = invoiceOcrSchema.parse({
      ...extractedData,
      confidence: extractedData.confidence || 0.5,
    });

    // 7. Return success
    return {
      success: true,
      data: {
        ...validated,
        extractionMethod,
      },
    };
  } catch (error: any) {
    console.error('[OCR Service] Error:', error.message);
    
    // Don't expose internal errors to users
    if (error.message?.includes('API key')) {
      return {
        success: false,
        error: 'OCR service not configured. Please contact support.',
      };
    }

    return {
      success: false,
      error: error.message || 'OCR extraction failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF Extraction (pdf-parse + OpenAI)
// ═══════════════════════════════════════════════════════════════════════════════

async function extractFromPDF(fileBuffer: Buffer, creditContext: CreditContext): Promise<any> {
  try {
    // 1. Extract text from PDF
    const pdf = await getPdfParse();
    const pdfData = await pdf(fileBuffer);
    const extractedText = pdfData.text;

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text found in PDF. Try using an image file or a different PDF.');
    }

    // 2. Parse with OpenAI
    const structuredData = await parseInvoiceWithOpenAI(extractedText, creditContext);

    return structuredData;
  } catch (error: any) {
    // If pdf-parse fails, could try OpenAI Vision as fallback
    console.error('[OCR] PDF extraction failed:', error.message);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Image Extraction (OpenAI Vision)
// ═══════════════════════════════════════════════════════════════════════════════

async function extractFromImage(
  fileBuffer: Buffer,
  fileExt: string,
  creditContext: CreditContext
): Promise<any> {
  try {
    const openai = getOpenAIClient();
    
    // Convert to base64
    const base64Image = fileBuffer.toString('base64');
    const mimeType = fileExt === '.png' ? 'image/png' : 'image/jpeg';

    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Using gpt-4o which supports vision
      messages: [
        {
          role: 'system',
          content: 'You are an expert invoice data extractor. Extract invoice data and return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract structured invoice data from this image. Return ONLY valid JSON with this exact structure:
{
  "invoiceNumber": "string",
  "invoiceDate": "YYYY-MM-DD",
  "supplierName": "string",
  "supplierTaxId": "string (NIF/NIPC/Tax ID of the supplier)",
  "totalAmount": number,
  "currency": "EUR|USD|GBP",
  "lineItems": [
    {
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "total": number
    }
  ],
  "confidence": number (0-1, your confidence in the extraction)
}

IMPORTANT: Always extract the supplier's NIF/NIPC (Portuguese tax ID) or Tax ID. Look for:
- "NIF:", "NIPC:", "Tax ID:", "Contribuinte:", "N.I.F.", "N.I.P.C."
- Usually a 9-digit number in Portugal
- Located near the supplier's name/address

If you cannot find a field, use reasonable defaults:
- invoiceNumber: "UNKNOWN"
- invoiceDate: today's date in YYYY-MM-DD
- supplierTaxId: "UNKNOWN" (but try hard to find it!)
- currency: "EUR"
- confidence: lower value (0.3-0.5) if uncertain`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI Vision');
    }

    await recordOpenAIUsage(response.usage, creditContext, {
      service: 'gpt-4o',
      operation: 'invoice_image_extraction',
      metadata: {
        extractionMethod: 'openai-vision',
        fileExt,
      },
    });

    const parsed = JSON.parse(content);
    return parsed;
  } catch (error: any) {
    console.error('[OCR] Image extraction failed:', error.message);
    throw new Error(`Failed to extract data from image: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OpenAI Text Parsing (for PDF text)
// ═══════════════════════════════════════════════════════════════════════════════

async function parseInvoiceWithOpenAI(text: string, creditContext: CreditContext): Promise<any> {
  try {
    const openai = getOpenAIClient();

    const prompt = `Extract structured invoice data from the following text. Return ONLY valid JSON with this exact structure:
{
  "invoiceNumber": "string",
  "invoiceDate": "YYYY-MM-DD",
  "supplierName": "string",
  "supplierTaxId": "string (NIF/NIPC/Tax ID of the supplier)",
  "totalAmount": number,
  "currency": "EUR|USD|GBP",
  "lineItems": [
    {
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "total": number
    }
  ],
  "confidence": number (0-1, your confidence in the extraction)
}

IMPORTANT: Always extract the supplier's NIF/NIPC (Portuguese tax ID) or Tax ID. Look for:
- "NIF:", "NIPC:", "Tax ID:", "Contribuinte:", "N.I.F.", "N.I.P.C."
- Usually a 9-digit number in Portugal
- Located near the supplier's name/address

If you cannot find a field, use reasonable defaults:
- invoiceNumber: extract from text or use "UNKNOWN"
- invoiceDate: extract from text or use today's date in YYYY-MM-DD
- supplierTaxId: "UNKNOWN" (but try hard to find it!)
- currency: "EUR" if not specified
- confidence: lower value (0.3-0.5) if uncertain

Invoice text:
${text}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert invoice data extractor. Always return valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    await recordOpenAIUsage(response.usage, creditContext, {
      service: 'gpt-4o',
      operation: 'invoice_pdf_text_extraction',
    });

    const parsed = JSON.parse(content);
    return parsed;
  } catch (error: any) {
    console.error('[OCR] OpenAI parsing failed:', error.message);
    throw new Error(`Failed to parse invoice with OpenAI: ${error.message}`);
  }
}
