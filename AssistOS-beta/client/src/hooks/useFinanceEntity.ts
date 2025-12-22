import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { useState, useMemo } from "react";

interface UseFinanceEntityOptions {
  apiEndpoint: string;
  queryKey: string[];
  initialStatusFilter?: string;
  initialSearchQuery?: string;
}

interface UseFinanceEntityReturn<T> {
  data: T[] | undefined;
  isLoading: boolean;
  error: Error | null;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  query: UseQueryResult<T[], Error>;
}

/**
 * Generic hook for fetching finance entities with filtering support
 * @template T - The entity type (Invoice, Bill, etc.)
 */
export function useFinanceEntity<T = any>({
  apiEndpoint,
  queryKey,
  initialStatusFilter = 'all',
  initialSearchQuery = '',
}: UseFinanceEntityOptions): UseFinanceEntityReturn<T> {
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery);

  // Build query key with filters
  const fullQueryKey = useMemo(() => {
    const filters: any[] = [...queryKey];
    
    if (statusFilter !== 'all') {
      filters.push({ status: statusFilter });
    }
    
    if (searchQuery) {
      filters.push({ search: searchQuery });
    }
    
    return filters;
  }, [queryKey, statusFilter, searchQuery]);

  const query = useQuery<T[], Error>({
    queryKey: fullQueryKey,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    query,
  };
}
