/**
 * WhatsApp Message Classifier Service - Usage Examples
 * 
 * This file demonstrates how to use the WhatsApp Message Classifier Service
 * to classify incoming WhatsApp messages using Claude 3.5 Sonnet.
 */

import { whatsappClassifier, ClassificationResult } from './whatsapp-message-classifier.service';

// ==================== EXAMPLE 1: Single Message Classification ====================

async function classifySingleMessage() {
  const message = "Bom dia! Gostaria de encomendar 10 unidades do produto X. Podem confirmar disponibilidade?";
  
  const result: ClassificationResult = await whatsappClassifier.classifyMessage(message);
  
  console.log('Classification Result:', {
    category: result.category,        // Expected: 'order'
    confidence: result.confidence,    // Expected: ~0.9
    reasoning: result.context.reasoning,
    keywords: result.context.keywords,
    suggestedActions: result.context.suggestedActions
  });
  
  // Example output:
  // {
  //   category: 'order',
  //   confidence: 0.92,
  //   reasoning: 'Cliente expressa clara intenção de compra com quantidade específica',
  //   keywords: ['encomendar', '10 unidades', 'disponibilidade'],
  //   suggestedActions: ['Confirmar disponibilidade de stock', 'Enviar cotação', 'Processar pedido']
  // }
}

// ==================== EXAMPLE 2: Batch Classification ====================

async function classifyMultipleMessages() {
  const messages = [
    "Quanto custa o produto Y?",
    "Recebi a fatura. Vou processar o pagamento amanhã.",
    "O produto chegou com defeito! Muito insatisfeito!",
    "Obrigado pela ajuda de ontem!",
    "Preciso de 5kg de material Z para entregar na próxima semana"
  ];
  
  const results = await whatsappClassifier.classifyMessages(messages);
  
  results.forEach((result, index) => {
    console.log(`Message ${index + 1}:`, {
      text: messages[index],
      category: result.category,
      confidence: result.confidence
    });
  });
  
  // Expected categories: 
  // 1. 'info_request'
  // 2. 'invoice'
  // 3. 'complaint'
  // 4. 'other'
  // 5. 'order'
}

// ==================== EXAMPLE 3: Error Handling ====================

async function handleClassificationErrors() {
  try {
    // Check if service is available
    const status = whatsappClassifier.isAvailable();
    if (!status.available) {
      console.error('Classifier not available:', status.error);
      // Handle gracefully - maybe use fallback logic
      return;
    }
    
    // Classify message
    const result = await whatsappClassifier.classifyMessage("Test message");
    console.log('Classification successful:', result);
    
  } catch (error) {
    console.error('Classification failed:', error);
    // Service automatically returns safe fallback on error:
    // { category: 'other', confidence: 0.1, context: { reasoning: 'Erro...' } }
  }
}

// ==================== EXAMPLE 4: Integration with WhatsApp Routes ====================

async function integrateWithWhatsAppHandler(messageText: string, conversationId: string) {
  // Classify incoming message
  const classification = await whatsappClassifier.classifyMessage(messageText);
  
  // Route based on category
  switch (classification.category) {
    case 'order':
      console.log('📦 Order detected - routing to sales team');
      console.log('Suggested actions:', classification.context.suggestedActions);
      // Create order task, notify sales team, etc.
      break;
      
    case 'info_request':
      console.log('ℹ️ Info request - can use auto-responder');
      // Send automated information or route to support
      break;
      
    case 'invoice':
      console.log('💰 Invoice/payment - routing to finance');
      // Route to finance department
      break;
      
    case 'complaint':
      console.log('⚠️ Complaint detected - priority handling');
      console.log('Keywords:', classification.context.keywords);
      // Priority routing, notify manager
      break;
      
    case 'other':
      console.log('📝 General message - standard handling');
      // Standard queue
      break;
  }
  
  // Store classification for analytics
  return {
    messageText,
    conversationId,
    classification,
    timestamp: new Date()
  };
}

// ==================== EXAMPLE 5: Confidence-based Routing ====================

async function confidenceBasedRouting(messageText: string) {
  const classification = await whatsappClassifier.classifyMessage(messageText);
  
  if (classification.confidence >= 0.8) {
    console.log('✅ High confidence - automatic routing');
    // Route automatically based on category
  } else if (classification.confidence >= 0.5) {
    console.log('⚠️ Medium confidence - suggest category to human');
    // Show suggested category to human agent for confirmation
  } else {
    console.log('❌ Low confidence - manual review required');
    // Route to human for manual classification
  }
  
  return classification;
}

// Export examples for testing
export const examples = {
  classifySingleMessage,
  classifyMultipleMessages,
  handleClassificationErrors,
  integrateWithWhatsAppHandler,
  confidenceBasedRouting
};

/**
 * ENVIRONMENT SETUP:
 * 
 * Make sure to set the ANTHROPIC_API_KEY environment variable:
 * 
 * ```bash
 * export ANTHROPIC_API_KEY="your-anthropic-api-key"
 * ```
 * 
 * The service will gracefully handle missing API keys and provide
 * appropriate error messages.
 */
