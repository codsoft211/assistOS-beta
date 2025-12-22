import { OnboardEmployeeTool } from './onboard-employee';
import { RequestTimeoffTool } from './request-timeoff';
import { ApproveTimeoffTool } from './approve-timeoff';
import { TrackAttendanceTool } from './track-attendance';
import { PerformanceReviewTool } from './performance-review';
import { CalculatePayrollTool } from './calculate-payroll';
import { PostJobTool } from './post-job';
import { TrackCandidateTool } from './track-candidate';
import { ScheduleTrainingTool } from './schedule-training';
import { OffboardEmployeeTool } from './offboard-employee';
import { ListEmployeesTool } from './list-employees';
import { UpdateEmployeeTool } from './update-employee';
import { GenerateOrgChartTool } from './generate-org-chart';
import { GenerateAbsenceCalendarTool } from './generate-absence-calendar';
import { ScoreEmployeePerformanceTool } from './score-employee-performance';
import { HRAnalyticsReportTool } from './hr-analytics-report';
import { ListEmployeeDocumentsTool } from './list-employee-documents';
import { toolRegistry } from '../../kernel';

export const hrTools = [
  new OnboardEmployeeTool(),
  new RequestTimeoffTool(),
  new ApproveTimeoffTool(),
  new TrackAttendanceTool(),
  new PerformanceReviewTool(),
  new CalculatePayrollTool(),
  new PostJobTool(),
  new TrackCandidateTool(),
  new ScheduleTrainingTool(),
  new OffboardEmployeeTool(),
  new ListEmployeesTool(),
  new UpdateEmployeeTool(),
  new GenerateOrgChartTool(),
  new GenerateAbsenceCalendarTool(),
  new ScoreEmployeePerformanceTool(),
  new HRAnalyticsReportTool(),
  new ListEmployeeDocumentsTool()
];

// Auto-register all HR tools on import
for (const tool of hrTools) {
  toolRegistry.register(tool);
}

// Export all classes
export * from './onboard-employee';
export * from './request-timeoff';
export * from './approve-timeoff';
export * from './track-attendance';
export * from './performance-review';
export * from './calculate-payroll';
export * from './post-job';
export * from './track-candidate';
export * from './schedule-training';
export * from './offboard-employee';
export * from './list-employees';
export * from './update-employee';
export * from './generate-org-chart';
export * from './generate-absence-calendar';
export * from './score-employee-performance';
export * from './hr-analytics-report';
export * from './list-employee-documents';
