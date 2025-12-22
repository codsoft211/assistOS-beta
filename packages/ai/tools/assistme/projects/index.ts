import { CreateProjectTool } from './create-project';
import { ListProjectsTool } from './list-projects';
import { AssignTaskTool } from './assign-task';
import { TrackTimeTool } from './track-time';
import { UpdateMilestoneTool } from './update-milestone';
import { AllocateResourceTool } from './allocate-resource';
import { CheckBudgetVarianceTool } from './check-budget-variance';
import { GenerateGanttTool } from './generate-gantt';
import { ProjectStatusReportTool } from './project-status-report';
import { CloseProjectTool } from './close-project';
import { CreateProjectTemplateTool } from './create-project-template';
import { AddTaskDependencyTool } from './add-task-dependency';
import { CreateDeliverableTool } from './create-deliverable';
import { toolRegistry } from '../../kernel';

export const projectTools = [
  new CreateProjectTool(),
  new ListProjectsTool(),
  new AssignTaskTool(),
  new TrackTimeTool(),
  new UpdateMilestoneTool(),
  new AllocateResourceTool(),
  new CheckBudgetVarianceTool(),
  new GenerateGanttTool(),
  new ProjectStatusReportTool(),
  new CloseProjectTool(),
  new CreateProjectTemplateTool(),
  new AddTaskDependencyTool(),
  new CreateDeliverableTool()
];

// Auto-register all project tools on import
for (const tool of projectTools) {
  toolRegistry.register(tool);
}

// Export all classes
export * from './create-project';
export * from './list-projects';
export * from './assign-task';
export * from './track-time';
export * from './update-milestone';
export * from './allocate-resource';
export * from './check-budget-variance';
export * from './generate-gantt';
export * from './project-status-report';
export * from './close-project';
export * from './create-project-template';
export * from './add-task-dependency';
export * from './create-deliverable';
