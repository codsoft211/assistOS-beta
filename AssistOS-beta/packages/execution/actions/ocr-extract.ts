import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';
import fs from 'fs/promises';

// pdf-parse uses CommonJS, so we need require
const pdfParse = require('pdf-parse');

export class OcrExtractAction implements ActionExecutor {
  readonly name = 'ocr_extract';
  readonly description = 'Extract text from PDF files';
  
  validate(config: Record<string, any>): boolean {
    return !!(config.filePath || config.fileBuffer);
  }
  
  async execute(
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<ActionResult> {
    try {
      let buffer: Buffer;
      
      // Support both file path and direct buffer
      if (config.filePath) {
        buffer = await fs.readFile(config.filePath);
      } else if (config.fileBuffer) {
        buffer = Buffer.from(config.fileBuffer);
      } else {
        return {
          success: false,
          error: 'Either filePath or fileBuffer is required',
        };
      }
      
      // Extract text from PDF
      const data = await pdfParse(buffer);
      
      return {
        success: true,
        output: {
          text: data.text,
          pages: data.numpages,
          info: data.info,
          metadata: data.metadata,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to extract OCR: ${error.message}`,
      };
    }
  }
}
