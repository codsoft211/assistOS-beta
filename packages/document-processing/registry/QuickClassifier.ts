import { DocumentType, QuickClassificationResult } from '../types';

/**
 * Quick Document Classifier
 * 
 * Fast heuristic-based classification (1-2s) to determine document type
 * before calling expensive processors like Google Document AI.
 * 
 * Strategy:
 * 1. Check filename for obvious patterns
 * 2. Extract first page text via pdf-parse
 * 3. Look for keywords/patterns in Portuguese & English
 * 4. Return best guess with confidence score
 */
export class QuickClassifier {
  private static readonly INVOICE_KEYWORDS_PT = [
    'fatura',
    'factura',
    'fatura-recibo',
    'fatura recibo',
    'n.º fatura',
    'nº fatura',
    'documento',
    'invoice',
    'contribuinte',
    'nif',
    'total a pagar',
    'valor total',
    'iva',
  ];

  private static readonly RECEIPT_KEYWORDS = [
    'recibo',
    'receipt',
    'talão',
    'comprovativo',
  ];

  private static readonly CREDIT_NOTE_KEYWORDS = [
    'nota de crédito',
    'nota credito',
    'credit note',
    'nc ',
  ];

  private static readonly PO_KEYWORDS = [
    'encomenda',
    'purchase order',
    'ordem de compra',
    'requisição',
  ];

  /**
   * Classify document based on filename and content
   */
  async classify(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<QuickClassificationResult> {
    const indicators: string[] = [];
    const scores: Record<DocumentType, number> = {
      invoice: 0,
      receipt: 0,
      credit_note: 0,
      debit_note: 0,
      purchase_order: 0,
      quotation: 0,
      delivery_note: 0,
      contract: 0,
      other: 0,
    };

    // Step 1: Filename analysis
    const fileNameLower = fileName.toLowerCase();
    
    if (fileNameLower.includes('fatura') || fileNameLower.includes('invoice')) {
      scores.invoice += 30;
      indicators.push('filename contains "fatura/invoice"');
    }
    
    if (fileNameLower.includes('recibo') || fileNameLower.includes('receipt')) {
      scores.receipt += 30;
      indicators.push('filename contains "recibo/receipt"');
    }
    
    if (fileNameLower.includes('credito') || fileNameLower.includes('credit')) {
      scores.credit_note += 30;
      indicators.push('filename contains "credito/credit"');
    }
    
    if (fileNameLower.includes('encomenda') || fileNameLower.includes('po')) {
      scores.purchase_order += 30;
      indicators.push('filename contains "encomenda/po"');
    }

    // Step 2: Content analysis (PDF only)
    if (mimeType === 'application/pdf') {
      try {
        const text = await this.extractTextFast(fileBuffer);
        const textLower = text.toLowerCase();

        // Invoice detection
        const invoiceMatches = QuickClassifier.INVOICE_KEYWORDS_PT.filter(
          keyword => textLower.includes(keyword)
        );
        if (invoiceMatches.length >= 2) {
          scores.invoice += 40 + invoiceMatches.length * 5;
          indicators.push(`found ${invoiceMatches.length} invoice keywords`);
        }

        // Receipt detection
        const receiptMatches = QuickClassifier.RECEIPT_KEYWORDS.filter(
          keyword => textLower.includes(keyword)
        );
        if (receiptMatches.length >= 1) {
          scores.receipt += 30 + receiptMatches.length * 10;
          indicators.push(`found ${receiptMatches.length} receipt keywords`);
        }

        // Credit note detection
        const creditMatches = QuickClassifier.CREDIT_NOTE_KEYWORDS.filter(
          keyword => textLower.includes(keyword)
        );
        if (creditMatches.length >= 1) {
          scores.credit_note += 50;
          indicators.push('found credit note keywords');
        }

        // PO detection
        const poMatches = QuickClassifier.PO_KEYWORDS.filter(
          keyword => textLower.includes(keyword)
        );
        if (poMatches.length >= 1) {
          scores.purchase_order += 40;
          indicators.push('found purchase order keywords');
        }

        // Portuguese fiscal patterns
        if (
          (textLower.includes('contribuinte') || textLower.includes('nif')) &&
          (textLower.includes('iva') || textLower.includes('vat'))
        ) {
          scores.invoice += 20;
          indicators.push('Portuguese fiscal patterns detected');
        }
      } catch (error) {
        console.warn('QuickClassifier: Failed to extract PDF text', error);
      }
    }

    // Step 3: Find best match
    const sortedTypes = (Object.entries(scores) as [DocumentType, number][])
      .sort((a, b) => b[1] - a[1]);

    const [bestType, bestScore] = sortedTypes[0];
    
    // If no strong signal, default to invoice (most common)
    const finalType = bestScore >= 20 ? bestType : 'invoice';
    const confidence = Math.min(100, bestScore);

    if (indicators.length === 0) {
      indicators.push('no strong signals - defaulting to invoice');
    }

    return {
      documentType: finalType,
      confidence,
      indicators,
    };
  }

  /**
   * Fast text extraction (first 2 pages only)
   */
  private async extractTextFast(buffer: Buffer): Promise<string> {
    try {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default || pdfParseModule;
      
      if (typeof pdfParse !== 'function') {
        console.warn('QuickClassifier: pdf-parse not available as function, skipping text extraction');
        return '';
      }
      
      const data = await pdfParse(buffer, {
        max: 2, // Only first 2 pages
      });
      return data.text || '';
    } catch (error) {
      console.error('QuickClassifier: PDF parsing failed', error);
      return '';
    }
  }
}
