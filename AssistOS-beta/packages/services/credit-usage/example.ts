/**
 * CREDIT USAGE SERVICE - USAGE EXAMPLES
 * 
 * This file demonstrates how to use CreditUsageService
 * for different scenarios.
 */

import { creditUsageService } from './index';

// ==================== EXAMPLE 1: Track OpenAI GPT-5 Usage ====================

async function exampleTrackOpenAIUsage() {
  try {
    const result = await creditUsageService.trackModelUsage({
      tenantId: 'tenant-123',
      userId: 'user-456',
      provider: 'openai',
      service: 'gpt-5',
      promptTokens: 3000,
      completionTokens: 2000,
      environment: 'production',
      metadata: {
        model: 'gpt-5',
        conversationId: 'conv-789',
        orchestratorType: 'assistme',
      }
    });

    console.log('✅ Credits deducted:', result.creditsDeducted);
    console.log('💰 Provider cost (USD):', result.costUsd);
    console.log('💳 New balance:', result.newBalance);
    console.log('🆔 Transaction ID:', result.transactionId ?? 'pending');

  } catch (error) {
    if (error instanceof Error && error.message.includes('Insufficient credits')) {
      console.error('❌ Not enough credits!', error.message);
    } else {
      console.error('❌ Error tracking usage:', error);
    }
  }
}

// ==================== EXAMPLE 2: Complete GPT-5 Request with Input + Output ====================

async function exampleCompleteGPT5Request(
  tenantId: string,
  userId: string,
  conversationId: string,
  inputTokens: number,
  outputTokens: number
) {
  try {
    const result = await creditUsageService.trackModelUsage({
      tenantId,
      userId,
      provider: 'openai',
      service: 'gpt-5',
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      metadata: {
        model: 'gpt-5',
        conversationId,
        orchestratorType: 'assistme',
      }
    });
    console.log(`✅ Credits deducted: ${result.creditsDeducted}`);
    console.log(`💰 Provider cost: $${result.costUsd.toFixed(4)}`);
    console.log(`💳 New balance: ${result.newBalance.toFixed(2)}`);

    return { totalCredits: result.creditsDeducted, totalCost: result.costUsd, newBalance: result.newBalance };

  } catch (error) {
    console.error('❌ Error tracking GPT-5 request:', error);
    throw error;
  }
}

// ==================== EXAMPLE 3: Check Balance Before Operation ====================

async function exampleCheckBalanceBeforeOperation(tenantId: string) {
  const balance = await creditUsageService.getBalance(tenantId);
  
  if (balance < 1) {
    console.warn('⚠️ Low credit balance:', balance);
    return false; // Don't proceed with expensive operation
  }

  console.log('✅ Sufficient balance:', balance);
  return true;
}

// ==================== EXAMPLE 4: Add Credits (Purchase) ====================

async function exampleAddCredits() {
  const result = await creditUsageService.addCredits({
    tenantId: 'tenant-123',
    amount: 50.00, // €50 = 500 credits at €0.10/credit
    environment: 'production',
    reason: 'Credit package purchase: 500 credits for €50',
    paymentMethod: 'stripe',
    paymentReference: 'pi_1234567890',
    invoiceId: 'inv-abc123',
    createdBy: 'system',
  });

  console.log('✅ Credits added:', result.creditsDeducted); // Negative = addition
  console.log('💳 New balance:', result.newBalance);
  console.log('🆔 Transaction ID:', result.transactionId);
}

// ==================== EXAMPLE 5: Refund Credits (Error Recovery) ====================

async function exampleRefundCredits(originalTransactionId: string) {
  try {
    const result = await creditUsageService.refundCredits({
      transactionId: originalTransactionId,
      reason: 'OpenAI request failed - timeout',
      createdBy: 'system',
    });

    console.log('✅ Credits refunded:', result.creditsDeducted); // Negative = refund
    console.log('💳 New balance:', result.newBalance);
    console.log('🆔 Refund transaction ID:', result.transactionId);

  } catch (error) {
    console.error('❌ Error refunding credits:', error);
  }
}

// ==================== EXAMPLE 6: Future - Track WhatsApp Usage ====================

async function exampleFutureWhatsAppUsage() {
  /**
   * FUTURE EXTENSION: When WhatsApp pricing rule is added to DB:
   * 
   * INSERT INTO credit_pricing_rules VALUES
   *   ('production', 'external_service', 'whatsapp', 'message', 0.005, 'EUR', ...);
   */

  const result = await creditUsageService.trackUsageAndDeductCredits({
    tenantId: 'tenant-123',
    userId: 'user-456',
    provider: 'meta',
    service: 'whatsapp',
    unitsConsumed: 1, // 1 message
    unitType: 'message',
    metadata: {
      phoneNumber: '+351912345678',
      messageId: 'wamid.xxx',
    }
  });

  console.log('✅ WhatsApp message cost:', result.creditsDeducted, 'credits');
}

// ==================== EXAMPLE 7: Future - Track Storage Usage ====================

async function exampleFutureStorageUsage(storageGB: number) {
  /**
   * FUTURE EXTENSION: Cron job tracks storage daily
   */

  const result = await creditUsageService.trackUsageAndDeductCredits({
    tenantId: 'tenant-123',
    userId: 'system',
    provider: 'google',
    service: 'cloud-storage',
    unitsConsumed: storageGB,
    unitType: 'gb_month',
    metadata: {
      snapshotDate: new Date().toISOString(),
      bucketName: 'assistos-tenant-123',
    }
  });

  console.log('✅ Daily storage cost:', result.creditsDeducted, 'credits');
}

// Export examples
export {
  exampleTrackOpenAIUsage,
  exampleCompleteGPT5Request,
  exampleCheckBalanceBeforeOperation,
  exampleAddCredits,
  exampleRefundCredits,
  exampleFutureWhatsAppUsage,
  exampleFutureStorageUsage,
};
