/**
 * Expire Invitations Job
 * 
 * Runs periodically to expire old invitations and process refunds
 * Should run every hour
 */

import { db } from '../../api/db';
import { tenantInvitations } from '../../../shared/schema';
import { and, eq, lt, sql } from 'drizzle-orm';
import { inviteBillingService } from '../../api/services/invite-billing.service';

export async function expireInvitationsJob() {
  console.log('[ExpireInvitations] Starting job...');
  
  try {
    // Find all pending invitations that have expired
    const expiredInvitations = await db.query.tenantInvitations.findMany({
      where: and(
        eq(tenantInvitations.status, 'pending'),
        lt(tenantInvitations.expiresAt, new Date())
      ),
    });

    console.log(`[ExpireInvitations] Found ${expiredInvitations.length} expired invitations`);

    let successCount = 0;
    let errorCount = 0;

    // Process each expired invitation
    for (const invitation of expiredInvitations) {
      try {
        console.log(`[ExpireInvitations] Processing invitation ${invitation.id} for ${invitation.email}`);
        
        await inviteBillingService.processInviteDeclineOrExpiry(
          invitation.id,
          'expired'
        );

        successCount++;
        console.log(`[ExpireInvitations] Successfully expired invitation ${invitation.id}`);
      } catch (error: any) {
        errorCount++;
        console.error(`[ExpireInvitations] Error expiring invitation ${invitation.id}:`, error);
        console.error(`[ExpireInvitations] Error details:`, error.message);
      }
    }

    console.log(`[ExpireInvitations] Job completed. Success: ${successCount}, Errors: ${errorCount}`);

    return {
      success: true,
      processed: expiredInvitations.length,
      successCount,
      errorCount,
    };
  } catch (error: any) {
    console.error('[ExpireInvitations] Job failed:', error);
    throw error;
  }
}

// Export for BullMQ worker
export const expireInvitationsJobHandler = async () => {
  return await expireInvitationsJob();
};

