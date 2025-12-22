import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { inventoryTransactions, inventoryLevels } from 'shared/schema';
import { eq, and } from 'drizzle-orm';

export class ShipOrderTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'ship_order',
    category: 'logistics' as const,
    scope: 'tenant' as const,
    description: 'Expede uma encomenda e gera documentação de envio',
    parameters: [
      {
        name: 'orderId',
        type: 'string',
        description: 'ID da encomenda',
        required: true
      },
      {
        name: 'carrier',
        type: 'string',
        description: 'Transportadora (CTT/DHL/UPS/etc)',
        required: true
      },
      {
        name: 'trackingNumber',
        type: 'string',
        description: 'Número de rastreamento',
        required: false
      },
      {
        name: 'shippingMethod',
        type: 'string',
        description: 'Método (express/standard/economy)',
        required: false,
        default: 'standard'
      }
    ],
    outputSchema: z.object({
      shipmentId: z.string(),
      trackingNumber: z.string(),
      estimatedDelivery: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      orderId: string;
      carrier: string;
      trackingNumber?: string;
      shippingMethod?: string;
    },
    context: ToolExecutionContext
  ) {
    const tracking = input.trackingNumber || `TRK${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + (input.shippingMethod === 'express' ? 1 : input.shippingMethod === 'economy' ? 5 : 3));
    
    const [shipment] = await db.insert(inventoryTransactions).values({
      tenantId: context.tenantId,
      type: 'shipment',
      productId: input.orderId,
      qty: '0',
      performedBy: context.userId,
      linkedDocumentId: input.orderId,
      notes: `Transportadora: ${input.carrier}, Tracking: ${tracking}, Método: ${input.shippingMethod || 'standard'}`,
      metadata: {
        carrier: input.carrier,
        trackingNumber: tracking,
        shippingMethod: input.shippingMethod || 'standard',
        estimatedDelivery: deliveryDate.toISOString()
      }
    }).returning();
    
    return {
      shipmentId: shipment.id,
      trackingNumber: tracking,
      estimatedDelivery: deliveryDate.toISOString().split('T')[0],
      message: `Encomenda ${input.orderId} expedida! Envio ${shipment.id} via ${input.carrier}. Tracking: ${tracking}. Entrega prevista: ${deliveryDate.toLocaleDateString('pt-PT')}`
    };
  }
}
