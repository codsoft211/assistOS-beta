import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import i18n from '@/i18n';

/**
 * useLiveSettings Hook - Real-Time SSE Subscription for Cross-Tab Sync
 * 
 * Subscribes to Server-Sent Events for real-time settings updates.
 * Automatically updates TanStack Query cache when backend data changes.
 * 
 * Features:
 * - EventSource connection to /api/realtime/stream
 * - Handles user preferences, tenant, and team events
 * - Prevents memory leaks with cleanup on unmount
 * - Prevents duplicate subscriptions with ref tracking
 * - Cross-tab synchronization (each tab has its own connection)
 * 
 * Usage:
 * ```tsx
 * export default function SettingsPage() {
 *   useLiveSettings(); // Call once at top level
 *   // ... rest of component
 * }
 * ```
 */
export function useLiveSettings() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  
  useEffect(() => {
    // Prevent duplicate subscriptions
    if (eventSourceRef.current) {
      console.warn('[SSE] Closing existing connection before creating new one');
      eventSourceRef.current.close();
    }
    
    // Create SSE connection
    console.log('[SSE] Establishing connection to /api/realtime/stream');
    const eventSource = new EventSource('/api/realtime/stream', {
      withCredentials: true,
    });
    eventSourceRef.current = eventSource;
    
    // Connection opened
    eventSource.onopen = () => {
      console.log('[SSE] Connection established');
    };
    
    // Handle user preferences updated event
    eventSource.addEventListener('settings:user.preferences.updated', (event) => {
      try {
        const { userId, preferences } = JSON.parse(event.data);
        console.log('[SSE] User preferences updated:', preferences);
        
        // Update preferences cache directly (immediate update, no refetch)
        queryClient.setQueryData(['/api/users/preferences'], preferences);
        
        // Apply language preference immediately
        if (preferences.language) {
          const lang = preferences.language === 'en-US' ? 'en' : 'pt';
          console.log('[SSE] Applying language preference:', lang);
          i18n.changeLanguage(lang);
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('assistos-language', lang);
          }
        }
      } catch (error) {
        console.error('[SSE] Error parsing settings:user.preferences.updated event:', error);
      }
    });
    
    // Handle user profile updated event
    eventSource.addEventListener('settings:user.profile.updated', (event) => {
      try {
        const { userId, profile } = JSON.parse(event.data);
        console.log('[SSE] User profile updated:', profile);
        
        // Invalidate profile query to refetch
        queryClient.invalidateQueries({ queryKey: ['/api/users/me'] });
      } catch (error) {
        console.error('[SSE] Error parsing user.profile.updated event:', error);
      }
    });
    
    // Handle tenant updated event
    eventSource.addEventListener('settings:tenant.updated', (event) => {
      try {
        const { tenantId, tenant } = JSON.parse(event.data);
        console.log('[SSE] Tenant updated:', tenant);
        
        // Invalidate context queries to refetch (ensures data freshness)
        queryClient.invalidateQueries({ queryKey: ['/api/context'] });
        queryClient.invalidateQueries({ queryKey: ['/api/context/tenants/list'] });
      } catch (error) {
        console.error('[SSE] Error parsing settings:tenant.updated event:', error);
      }
    });
    
    // Handle team member changed event
    eventSource.addEventListener('settings:team.member.changed', (event) => {
      try {
        const { tenantId, action, member } = JSON.parse(event.data);
        console.log('[SSE] Team member changed:', action, member);
        
        // Invalidate team queries to refetch (ensures paginated list consistency)
        queryClient.invalidateQueries({ queryKey: ['/api/team'] });
        // Also refresh billing summary because seat counts and pricing depend on membership changes
        queryClient.invalidateQueries({ queryKey: ['/api/team/billing-summary'] });
      } catch (error) {
        console.error('[SSE] Error parsing settings:team.member.changed event:', error);
      }
    });
    
    // Handle errors (EventSource auto-reconnects)
    eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
      // EventSource automatically attempts to reconnect
      // No manual reconnection needed
    };
    
    // Cleanup on unmount
    return () => {
      console.log('[SSE] Closing connection');
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [queryClient]);
}
