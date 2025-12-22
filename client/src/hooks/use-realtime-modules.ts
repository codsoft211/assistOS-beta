import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';

/**
 * Hook that listens to SSE events for module updates
 * and automatically invalidates the sidebar cache
 * 
 * Only connects when user is authenticated to avoid 401 retry loops
 */
export function useRealtimeModules() {
  const queryClient = useQueryClient();
  
  // Check if user is authenticated
  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  useEffect(() => {
    // Skip SSE connection if user is not authenticated
    if (!user) {
      return;
    }

    let eventSource: EventSource | null = null;

    const connect = () => {
      try {
        eventSource = new EventSource('/api/realtime/stream', {
          withCredentials: true,
        });

        // Helper to invalidate all module-related caches
        const invalidateModuleCaches = (source: string, data?: any) => {
          console.log(`[SSE] ${source}, invalidating caches:`, data);
          
          queryClient.invalidateQueries({ queryKey: ['/api/modules/sidebar'] });
          queryClient.invalidateQueries({ queryKey: ['/api/modules'] });
          queryClient.invalidateQueries({ queryKey: ['/api/modules/available'] });
          queryClient.invalidateQueries({ queryKey: ['/api/modules/tenant'] });
          queryClient.invalidateQueries({ queryKey: ['/api/custom-tables'] });
          queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
        };

        // Helper to invalidate custom table caches
        const invalidateCustomTableCaches = (source: string, data?: any) => {
          console.log(`[SSE] ${source}, invalidating caches:`, data);
          queryClient.invalidateQueries({ queryKey: ['/api/custom-tables'] });
        };

        // Listen for 'modules.updated' SSE event type (sent by backend)
        eventSource.addEventListener('modules.updated', (event) => {
          try {
            const data = JSON.parse(event.data);
            invalidateModuleCaches('modules.updated event received', data);
          } catch (error) {
            console.error('[SSE] Error parsing modules.updated event:', error);
          }
        });

        // Listen for 'custom-tables.updated' SSE event type
        eventSource.addEventListener('custom-tables.updated', (event) => {
          try {
            const data = JSON.parse(event.data);
            invalidateCustomTableCaches('custom-tables.updated event received', data);
          } catch (error) {
            console.error('[SSE] Error parsing custom-tables.updated event:', error);
          }
        });

        // Listen for 'schema.updated' SSE event type
        eventSource.addEventListener('schema.updated', (event) => {
          try {
            const data = JSON.parse(event.data);
            invalidateCustomTableCaches('schema.updated event received', data);
            queryClient.invalidateQueries({ queryKey: ['/api/tenant'] });
          } catch (error) {
            console.error('[SSE] Error parsing schema.updated event:', error);
          }
        });

        // Also listen for generic message events (fallback)
        eventSource.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            // Handle initial connection message
            if (data.type === 'connected') {
              console.log('[SSE] Connected to tenant:', data.tenantId);
            }
          } catch (error) {
            // Ignore parse errors for heartbeat messages
          }
        });

        eventSource.addEventListener('error', (error) => {
          console.error('[SSE] Connection error:', error);
          // Don't close - let EventSource auto-reconnect with credentials
          // Manual close/reconnect creates new connection without session cookies
        });

        console.log('[SSE] Connected to realtime stream');
      } catch (error) {
        console.error('[SSE] Failed to connect:', error);
      }
    };

    // Connect when component mounts (only if authenticated)
    connect();

    // Cleanup on unmount
    return () => {
      if (eventSource) {
        console.log('[SSE] Disconnecting from realtime stream');
        eventSource.close();
      }
    };
  }, [user, queryClient]);
}
