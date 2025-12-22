import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search, FileText, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SearchResult {
  documentId: string;
  title: string;
  filename: string;
  documentType: string;
  similarity: number;
  excerpt: string;
}

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const searchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const response = await fetch('/api/documents/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 10 }),
      });
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      searchMutation.mutate(query);
    }
  };

  const results = searchMutation.data?.results || [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-semantic-search">
          <Sparkles className="mr-2 h-4 w-4" />
          Semantic Search
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl" data-testid="dialog-search">
        <DialogHeader>
          <DialogTitle>Semantic Document Search</DialogTitle>
          <DialogDescription>
            Search documents using natural language and AI
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="e.g., Find invoices from supplier ABC in January 2025"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
            data-testid="input-search-query"
          />
          <Button
            type="submit"
            disabled={!query.trim() || searchMutation.isPending}
            data-testid="button-search"
          >
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
        </form>

        <ScrollArea className="max-h-96">
          {searchMutation.isPending ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-3 rounded-md border space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : searchMutation.isError ? (
            <div className="text-center py-8 text-destructive" data-testid="text-search-error">
              <p>Search failed. Please try again.</p>
            </div>
          ) : results.length === 0 && searchMutation.isSuccess ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-results">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No documents found</p>
              <p className="text-sm mt-1">Try a different search query</p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((result: SearchResult) => (
                <div
                  key={result.documentId}
                  className="p-3 rounded-md border hover-elevate cursor-pointer"
                  data-testid={`search-result-${result.documentId}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium" data-testid={`text-result-title-${result.documentId}`}>{result.title || result.filename}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 line-clamp-2" data-testid={`text-result-excerpt-${result.documentId}`}>
                        {result.excerpt}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs" data-testid={`badge-result-type-${result.documentId}`}>
                          {result.documentType}
                        </Badge>
                        <span className="text-xs text-muted-foreground" data-testid={`text-result-similarity-${result.documentId}`}>
                          {(result.similarity * 100).toFixed(1)}% match
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
