/**
 * HR Module - API Routes
 */

export const hrRoutes = [
  // Employees
  { method: 'GET', path: '/api/hr/employees', handler: 'listEmployees' },
  { method: 'POST', path: '/api/hr/employees', handler: 'createEmployee' },
  { method: 'GET', path: '/api/hr/employees/:id', handler: 'getEmployee' },
  { method: 'PATCH', path: '/api/hr/employees/:id', handler: 'updateEmployee' },
  { method: 'DELETE', path: '/api/hr/employees/:id', handler: 'deleteEmployee' },
  
  // Departments
  { method: 'GET', path: '/api/hr/departments', handler: 'listDepartments' },
  { method: 'POST', path: '/api/hr/departments', handler: 'createDepartment' },
  { method: 'GET', path: '/api/hr/departments/:id', handler: 'getDepartment' },
  { method: 'PATCH', path: '/api/hr/departments/:id', handler: 'updateDepartment' },
  { method: 'DELETE', path: '/api/hr/departments/:id', handler: 'deleteDepartment' },
  
  // Attendance
  { method: 'GET', path: '/api/hr/attendance', handler: 'listAttendance' },
  { method: 'POST', path: '/api/hr/attendance/clock-in', handler: 'clockIn' },
  { method: 'POST', path: '/api/hr/attendance/clock-out', handler: 'clockOut' },
  { method: 'GET', path: '/api/hr/attendance/:employeeId', handler: 'getEmployeeAttendance' },
  
  // Leave Requests
  { method: 'GET', path: '/api/hr/leave-requests', handler: 'listLeaveRequests' },
  { method: 'POST', path: '/api/hr/leave-requests', handler: 'createLeaveRequest' },
  { method: 'GET', path: '/api/hr/leave-requests/:id', handler: 'getLeaveRequest' },
  { method: 'PATCH', path: '/api/hr/leave-requests/:id/approve', handler: 'approveLeaveRequest' },
  { method: 'PATCH', path: '/api/hr/leave-requests/:id/reject', handler: 'rejectLeaveRequest' },
  
  // Payroll
  { method: 'GET', path: '/api/hr/payroll', handler: 'listPayroll' },
  { method: 'POST', path: '/api/hr/payroll', handler: 'createPayroll' },
  { method: 'GET', path: '/api/hr/payroll/:id', handler: 'getPayroll' },
  { method: 'POST', path: '/api/hr/payroll/:id/process', handler: 'processPayroll' },
  
  // Performance Reviews
  { method: 'GET', path: '/api/hr/performance-reviews', handler: 'listPerformanceReviews' },
  { method: 'POST', path: '/api/hr/performance-reviews', handler: 'createPerformanceReview' },
  { method: 'GET', path: '/api/hr/performance-reviews/:id', handler: 'getPerformanceReview' },
  { method: 'PATCH', path: '/api/hr/performance-reviews/:id', handler: 'updatePerformanceReview' },
  
  // Training
  { method: 'GET', path: '/api/hr/training', handler: 'listTrainingRecords' },
  { method: 'POST', path: '/api/hr/training', handler: 'createTrainingRecord' },
  { method: 'GET', path: '/api/hr/training/:id', handler: 'getTrainingRecord' },
  
  // Analytics
  { method: 'GET', path: '/api/hr/analytics/headcount', handler: 'getHeadcount' },
  { method: 'GET', path: '/api/hr/analytics/turnover', handler: 'getTurnover' },
  { method: 'GET', path: '/api/hr/analytics/attendance-summary', handler: 'getAttendanceSummary' },
];

