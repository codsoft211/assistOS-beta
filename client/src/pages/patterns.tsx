import PatternSuggestions from "@/components/PatternSuggestions";

export default function PatternsPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-7xl mx-auto">
        <PatternSuggestions />
      </div>
    </div>
  );
}
