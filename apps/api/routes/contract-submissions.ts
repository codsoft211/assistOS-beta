import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { contractSubmissionService } from '../services/document-processing/ContractSubmissionService';
import { objectStorageService } from '../services/storage.service';
import { createHash } from 'crypto';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and images (JPEG, PNG, TIFF) are allowed.'));
    }
  },
});

/**
 * POST /api/crm/contract-submissions/upload
 * Upload contract file and create submission record
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const environment = (req as any).environment || 'production';

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileHash = createHash('sha256').update(req.file.buffer).digest('hex');

    const internalPath = await objectStorageService.uploadContractBuffer({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      fileHash,
      tenantId,
      userId,
      documentType: 'contract',
    });

    const submission = await contractSubmissionService.createSubmission({
      tenantId,
      userId,
      fileName: req.file.originalname,
      fileUrl: internalPath,
      fileMimeType: req.file.mimetype,
      fileSize: req.file.size,
      environment,
    });

    res.json(submission);
  } catch (error: any) {
    console.error('[Contract Submissions] Upload error:', error);
    res.status(500).json({ error: 'Failed to upload contract', details: error.message });
  }
});

/**
 * POST /api/crm/contract-submissions/:id/process
 * Trigger OCR processing for uploaded contract
 */
router.post('/:id/process', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const submission = await contractSubmissionService.getSubmission({
      submissionId: id,
      tenantId,
    });

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (submission.status !== 'uploaded') {
      return res.status(400).json({ 
        error: `Cannot process submission in status: ${submission.status}`,
        currentStatus: submission.status,
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendProgress = (progress: number, message: string) => {
      res.write(`data: ${JSON.stringify({ progress, message })}\n\n`);
    };

    try {
      sendProgress(5, 'Carregando arquivo do armazenamento...');

      const fileBuffer = await objectStorageService.downloadFromInternalPath(submission.fileUrl);

      const result = await contractSubmissionService.triggerProcessing({
        submissionId: id,
        tenantId,
        userId,
        fileBuffer,
        mimeType: submission.fileMimeType,
        onProgress: sendProgress,
      });

      res.write(`data: ${JSON.stringify({ 
        progress: 100, 
        message: 'Processamento concluído!',
        complete: true,
        result: {
          extractedData: result.extractedData,
          confidence: result.confidence,
          processorUsed: result.processorUsed,
        }
      })}\n\n`);

      res.end();
    } catch (error: any) {
      sendProgress(0, `Erro: ${error.message}`);
      res.write(`data: ${JSON.stringify({ 
        progress: 0, 
        error: error.message,
        complete: true
      })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error('[Contract Submissions] Processing error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process contract', details: error.message });
    }
  }
});

/**
 * GET /api/crm/contract-submissions
 * Get all contract submissions for tenant
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || 'production';

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status } = req.query;

    const submissions = await contractSubmissionService.getSubmissions({
      tenantId,
      environment,
      status: status as string | undefined,
    });

    res.json(submissions);
  } catch (error: any) {
    console.error('[Contract Submissions] List error:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

/**
 * GET /api/crm/contract-submissions/:id
 * Get specific contract submission
 */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const submission = await contractSubmissionService.getSubmission({
      submissionId: id,
      tenantId,
    });

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json(submission);
  } catch (error: any) {
    console.error('[Contract Submissions] Get error:', error);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

/**
 * PATCH /api/crm/contract-submissions/:id/review
 * Submit human review corrections
 */
const reviewSchema = z.object({
  reviewedData: z.record(z.any()),
  reviewNotes: z.string().optional(),
});

router.patch('/:id/review', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const validated = reviewSchema.parse(req.body);

    const updated = await contractSubmissionService.submitReview({
      submissionId: id,
      tenantId,
      userId,
      reviewedData: validated.reviewedData,
      reviewNotes: validated.reviewNotes,
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[Contract Submissions] Review error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to submit review', details: error.message });
  }
});

/**
 * POST /api/crm/contract-submissions/:id/approve
 * Approve submission and create final CRM contract
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;
    const environment = (req as any).environment || 'production';

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const result = await contractSubmissionService.approve({
      submissionId: id,
      tenantId,
      userId,
      environment,
    });

    res.json({
      success: true,
      message: 'Contract approved and created successfully',
      submission: result.submission,
      contract: result.contract,
    });
  } catch (error: any) {
    console.error('[Contract Submissions] Approve error:', error);
    res.status(500).json({ error: 'Failed to approve contract', details: error.message });
  }
});

/**
 * POST /api/crm/contract-submissions/:id/reject
 * Reject submission
 */
const rejectSchema = z.object({
  reviewNotes: z.string().optional(),
});

router.post('/:id/reject', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).userId;

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const validated = rejectSchema.parse(req.body);

    const updated = await contractSubmissionService.reject({
      submissionId: id,
      tenantId,
      userId,
      reviewNotes: validated.reviewNotes,
    });

    res.json({
      success: true,
      message: 'Submission rejected',
      submission: updated,
    });
  } catch (error: any) {
    console.error('[Contract Submissions] Reject error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to reject submission', details: error.message });
  }
});

export default router;
