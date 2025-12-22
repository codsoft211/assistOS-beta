import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let errorMessage = text;
    
    try {
      const json = JSON.parse(text);
      errorMessage = json.message || json.error || json.details || text;
    } catch {
      errorMessage = text;
    }
    
    throw new Error(errorMessage);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn = <T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> => {
  const { on401: unauthorizedBehavior } = options;
  return async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    
    try {
      const res = await fetch(url, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null as T;
      }

      // Handle 404 for messages queries gracefully - return empty array
      if (res.status === 404 && url.includes("/messages")) {
        console.warn(`[queryClient] Conversation not found for messages query: ${url}, returning empty array`);
        return ([] as any) as T;
      }

      // Handle 500 errors for messages queries gracefully - return empty array to prevent UI breakage
      // But check if it's a pool error - if so, throw it to allow retry mechanism
      if (res.status === 500 && url.includes("/messages")) {
        const errorText = await res.text();
        const isPoolError = 
          errorText.includes("MaxClientsInSessionMode") || 
          errorText.includes("max clients reached") ||
          errorText.includes("pool_size") ||
          errorText.includes("connection pool exhausted");
        
        if (isPoolError) {
          // Throw to allow retry mechanism to handle it
          // Include URL in error message so retry function can identify messages queries
          console.warn(`[queryClient] Database pool error detected for messages query: ${url}, will retry...`);
          const poolError = new Error(`Database pool exhausted: ${errorText || "max clients reached"}`);
          (poolError as any).isMessagesQuery = true;
          throw poolError;
        }
        
        // For other 500 errors, return empty array as fallback
        console.error(`[queryClient] Server error for messages query: ${url}, error: ${errorText}`);
        return ([] as any) as T;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error: any) {
      // Handle database pool errors for messages queries
      if (url.includes("/messages")) {
        const errorMessage = error?.message || String(error);
        const isPoolError = 
          errorMessage.includes("MaxClientsInSessionMode") || 
          errorMessage.includes("max clients reached") ||
          errorMessage.includes("pool_size") ||
          errorMessage.includes("connection pool exhausted");

        if (isPoolError) {
          // Log warning but don't return empty array yet - let React Query retry
          // If all retries fail, React Query will mark the query as error state
          // and we'll handle it in the component
          console.warn(`[queryClient] Database pool exhausted for messages query: ${url}, will retry with exponential backoff...`);
          // Mark as messages query for retry function
          (error as any).isMessagesQuery = true;
          // Re-throw to let React Query's retry mechanism handle it
          throw error;
        }
      }
      // Re-throw for other errors
      throw error;
    }
  };
};

/**
 * Custom retry function that enables retries for messages queries when pool exhaustion errors occur
 */
function shouldRetryMessagesQuery(failureCount: number, error: Error): boolean {
  // Only retry up to 3 times for messages queries
  if (failureCount >= 3) {
    return false;
  }

  // Check if this error is marked as coming from a messages query
  const isMessagesQuery = (error as any)?.isMessagesQuery || false;
  
  // Get error message
  const errorMessage = error?.message || String(error) || "";
  
  // Check if this is a pool exhaustion error
  const isPoolError = 
    errorMessage.includes("MaxClientsInSessionMode") || 
    errorMessage.includes("max clients reached") ||
    errorMessage.includes("pool_size") ||
    errorMessage.includes("connection pool exhausted") ||
    errorMessage.includes("Database pool exhausted");

  // Only retry pool exhaustion errors from messages queries
  return isMessagesQuery && isPoolError;
}

/**
 * Exponential backoff retry delay for messages queries
 * Returns: 200ms, 500ms, 1000ms for attempts 1, 2, 3
 */
function retryDelay(attemptIndex: number, error: Error): number {
  // Check if this is a pool error
  const errorMessage = error?.message || String(error) || "";
  const isPoolError = 
    errorMessage.includes("MaxClientsInSessionMode") || 
    errorMessage.includes("max clients reached") ||
    errorMessage.includes("pool_size") ||
    errorMessage.includes("connection pool exhausted");
  
  // Only apply exponential backoff for pool errors
  if (isPoolError) {
    // For pool errors, use exponential backoff: 200ms, 500ms, 1000ms
    const baseDelay = 200;
    return Math.min(baseDelay * Math.pow(2.5, attemptIndex), 1000);
  }
  
  // Default delay for other errors
  return Math.min(1000 * 2 ** attemptIndex, 30000);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: (failureCount: number, error: Error) => {
        // Get URL from error if it contains query info, or check error message
        const errorMessage = error?.message || String(error) || "";
        const isMessagesQuery = 
          errorMessage.includes("/messages") || 
          error.stack?.includes("/messages");
        
        if (!isMessagesQuery) {
          return false; // Don't retry non-messages queries by default
        }
        
        return shouldRetryMessagesQuery(failureCount, error);
      },
      retryDelay,
    },
    mutations: {
      retry: false,
    },
  },
});
