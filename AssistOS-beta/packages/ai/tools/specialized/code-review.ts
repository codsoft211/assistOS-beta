// Migrated from AssistOS legacy - Phase 3
// Source: /tmp/assistos-legacy/server/_legacy/ai-tools-code-review.ts (250 lines, 8.3KB)

// TODO: Migrate code review service when needed
// import { codeReviewService } from "../../../../apps/api/services/code-review-service";

/**
 * Code Review AI Tools
 * Permite que Developer Agents (Configuration Studio, etc.) peçam code reviews durante desenvolvimento
 */

export const codeReviewTools = [
  {
    type: "function" as const,
    function: {
      name: "request_code_review",
      description: "Request architectural review of your implementation. Use this BEFORE completing a task to ensure code quality. Automatically executes the review and returns results.",
      parameters: {
        type: "object",
        properties: {
          filesModified: {
            type: "array",
            items: { type: "string" },
            description: "List of file paths that were created/modified (e.g., ['server/routes/example.ts', 'client/src/pages/Example.tsx'])",
          },
          changeDescription: {
            type: "string",
            description: "Brief description of what was implemented (e.g., 'Added new product catalog feature with filtering')",
          },
          taskId: {
            type: "string",
            description: "Optional task ID if this review is for a specific task",
          },
        },
        required: ["filesModified", "changeDescription"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_review_status",
      description: "Get status and results of a specific code review. Returns detailed analysis if review is complete.",
      parameters: {
        type: "object",
        properties: {
          reviewId: {
            type: "number",
            description: "ID of the review to check",
          },
        },
        required: ["reviewId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_recent_reviews",
      description: "Get recent code reviews for this tenant to see quality history and trends over time.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of recent reviews to fetch (default: 10, max: 50)",
          },
        },
      },
    },
  },
];

/**
 * Execute Code Review tool
 * Handles all code review tool calls and interacts with CodeReviewService
 */
export async function handleCodeReviewToolCall(
  toolName: string,
  args: any,
  tenantId: string,
  userId: string = "system"
): Promise<{ success: boolean; data?: any; error?: string; message?: string }> {
  try {
    switch (toolName) {
      case "request_code_review": {
        const { filesModified, changeDescription, taskId } = args;

        if (!filesModified || !Array.isArray(filesModified) || filesModified.length === 0) {
          return {
            success: false,
            error: "filesModified is required and must be a non-empty array",
          };
        }

        if (!changeDescription || typeof changeDescription !== "string") {
          return {
            success: false,
            error: "changeDescription is required and must be a string",
          };
        }

        console.log(`[Code Review Tool] Requesting review for tenant ${tenantId}`);
        console.log(`[Code Review Tool] Files: ${filesModified.join(", ")}`);

        const reviewId = await codeReviewService.requestReview({
          tenantId,
          filesModified,
          changeDescription,
          requestedBy: userId,
          taskId: taskId || undefined,
        });

        console.log(`[Code Review Tool] Review ${reviewId} created, executing...`);

        const result = await codeReviewService.executeReview(reviewId);

        console.log(`[Code Review Tool] Review ${reviewId} completed with score ${result.overallScore}/10`);

        return {
          success: true,
          data: {
            reviewId,
            ...result,
          },
          message: `✅ Code review completed!\n\n**Score:** ${result.overallScore}/10\n**Recommendation:** ${result.recommendation}\n\n**${result.criticalIssues.length} critical issues**, ${result.warnings.length} warnings, ${result.suggestions.length} suggestions`,
        };
      }

      case "get_review_status": {
        const { reviewId } = args;

        if (!reviewId || typeof reviewId !== "number") {
          return {
            success: false,
            error: "reviewId is required and must be a number",
          };
        }

        console.log(`[Code Review Tool] Fetching review ${reviewId}`);

        const review = await codeReviewService.getReview(reviewId);

        if (review.status === "pending") {
          return {
            success: true,
            data: {
              reviewId: review.id,
              status: "pending",
              filesModified: review.filesModified,
              changeDescription: review.changeDescription,
              requestedAt: review.reviewRequestedAt,
            },
            message: `⏳ Review ${reviewId} is pending execution`,
          };
        }

        if (review.status === "in_progress") {
          return {
            success: true,
            data: {
              reviewId: review.id,
              status: "in_progress",
              filesModified: review.filesModified,
              changeDescription: review.changeDescription,
              requestedAt: review.reviewRequestedAt,
            },
            message: `⚙️ Review ${reviewId} is currently being analyzed...`,
          };
        }

        if (review.status === "failed") {
          return {
            success: true,
            data: {
              reviewId: review.id,
              status: "failed",
              filesModified: review.filesModified,
              changeDescription: review.changeDescription,
              requestedAt: review.reviewRequestedAt,
            },
            message: `❌ Review ${reviewId} failed to execute`,
          };
        }

        return {
          success: true,
          data: {
            reviewId: review.id,
            status: review.status,
            overallScore: review.overallScore,
            recommendation: review.recommendation,
            strengths: review.strengths || [],
            criticalIssues: review.criticalIssues || [],
            warnings: review.warnings || [],
            suggestions: review.suggestions || [],
            impactAnalysis: review.impactAnalysis,
            detailedAnalysis: review.detailedAnalysis,
            requestedAt: review.reviewRequestedAt,
            completedAt: review.reviewCompletedAt,
          },
          message: `✅ Review ${reviewId} complete - Score: ${review.overallScore}/10, Recommendation: ${review.recommendation}`,
        };
      }

      case "get_recent_reviews": {
        const { limit } = args;
        const reviewLimit = Math.min(limit || 10, 50);

        console.log(`[Code Review Tool] Fetching ${reviewLimit} recent reviews for tenant ${tenantId}`);

        const reviews = await codeReviewService.getRecentReviews(tenantId, reviewLimit);

        const completedReviews = reviews.filter(r => r.status === "completed");
        const averageScore = completedReviews.length > 0
          ? completedReviews.reduce((sum, r) => sum + (r.overallScore || 0), 0) / completedReviews.length
          : 0;

        const qualityTrend = completedReviews.map(r => ({
          reviewId: r.id,
          score: r.overallScore,
          recommendation: r.recommendation,
          filesModified: r.filesModified,
          changeDescription: r.changeDescription,
          requestedAt: r.reviewRequestedAt,
          completedAt: r.reviewCompletedAt,
        }));

        return {
          success: true,
          data: {
            totalReviews: reviews.length,
            completedReviews: completedReviews.length,
            averageScore: Math.round(averageScore * 10) / 10,
            reviews: qualityTrend,
          },
          message: `📊 Found ${reviews.length} reviews (${completedReviews.length} completed)\n\nAverage Score: ${Math.round(averageScore * 10) / 10}/10`,
        };
      }

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  } catch (error) {
    console.error(`[Code Review Tool] Error executing ${toolName}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
