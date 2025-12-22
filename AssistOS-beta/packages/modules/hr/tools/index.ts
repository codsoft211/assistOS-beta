/**
 * HR Module - AI Tools
 * 
 * Comprehensive HR tools for:
 * - Employee management
 * - Department management  
 * - Attendance tracking
 * - Leave management
 * - Payroll
 */

import { z } from 'zod';
import type { ModuleTool } from '../../base/module.interface';
import { db } from '../../../../apps/api/db';
import { sql, eq, and, desc } from 'drizzle-orm';
import { HRQueryBuilder } from '../query-builder';

// ==================== ZOD VALIDATION SCHEMAS ====================

const listEmployeesSchema = z.object({
  departmentId: z.string().optional(),
  status: z.enum(['active', 'inactive', 'terminated']).optional(),
  limit: z.number().int().positive().optional(),
});

const createEmployeeSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  departmentId: z.string().optional(),
  position: z.string().optional(),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
  salary: z.number().positive().optional(),
});

const listDepartmentsSchema = z.object({
  limit: z.number().int().positive().optional(),
});

const createDepartmentSchema = z.object({
  name: z.string().min(1, 'Department name is required'),
  code: z.string().min(1, 'Department code is required'),
  managerId: z.string().optional(),
  parentDepartmentId: z.string().optional(),
});

const clockInOutSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  notes: z.string().optional(),
});

const createLeaveRequestSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  leaveType: z.enum(['vacation', 'sick', 'personal', 'maternity', 'paternity', 'unpaid']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  reason: z.string().optional(),
});

const processLeaveRequestSchema = z.object({
  leaveRequestId: z.string().min(1, 'Leave request ID is required'),
  approved: z.boolean(),
  notes: z.string().optional(),
});

export const hrTools: ModuleTool[] = [
  // ==================== EMPLOYEE TOOLS ====================
  
  {
    name: 'list_employees',
    description: 'Lists employees with optional filters (department, status)',
    parameters: [
      {
        name: 'departmentId',
        type: 'string',
        description: 'Filter by department ID',
        required: false
      },
      {
        name: 'status',
        type: 'string',
        description: 'Filter by status (active, inactive, terminated)',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of results',
        required: false,
        default: 50
      }
    ],
    execute: async (params: any, context) => {
      const validation = listEmployeesSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validation failed: ${validation.error.message}`,
        };
      }
      
      const { departmentId, status, limit = 50 } = validation.data;
      
      try {
        const queryBuilder = new HRQueryBuilder(context.tenantId);
        let query = queryBuilder.select('employees');
        
        const filters: any[] = [];
        if (departmentId) {
          filters.push({ field: 'department_id', operator: 'eq' as const, value: departmentId });
        }
        if (status) {
          filters.push({ field: 'status', operator: 'eq' as const, value: status });
        }
        
        if (filters.length > 0) {
          query = query.where(filters);
        }
        
        const employees = await query.limit(limit).execute();
        
        return { 
          success: true,
          employees, 
          total: employees.length 
        };
      } catch (error: any) {
        return {
          success: false,
          error: `Error listing employees: ${error.message}`,
        };
      }
    }
  },
  
  {
    name: 'create_employee',
    description: 'Creates a new employee record',
    parameters: [
      { name: 'firstName', type: 'string', description: 'Employee first name', required: true },
      { name: 'lastName', type: 'string', description: 'Employee last name', required: true },
      { name: 'email', type: 'string', description: 'Employee email address', required: true },
      { name: 'phone', type: 'string', description: 'Phone number', required: false },
      { name: 'departmentId', type: 'string', description: 'Department ID', required: false },
      { name: 'position', type: 'string', description: 'Job position/title', required: false },
      { name: 'hireDate', type: 'string', description: 'Hire date (YYYY-MM-DD)', required: false },
      { name: 'salary', type: 'number', description: 'Annual salary', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = createEmployeeSchema.safeParse(params);
      if (!validation.success) {
        return {
          success: false,
          error: `Validation failed: ${validation.error.message}`,
        };
      }
      
      const { firstName, lastName, email, phone, departmentId, position, hireDate, salary } = validation.data;
      
      try {
        // Generate employee number
        const lastEmployee = await db.execute(sql.raw(`
          SELECT employee_number FROM employees 
          WHERE tenant_id = '${context.tenantId}' 
          ORDER BY created_at DESC LIMIT 1
        `));
        
        const lastNumber = lastEmployee.rows[0]?.employee_number?.match(/\d+$/)?.[0] || '0';
        const employeeNumber = `EMP-${String(parseInt(lastNumber) + 1).padStart(6, '0')}`;
        
        const result = await db.execute(sql.raw(`
          INSERT INTO employees (
            tenant_id, employee_number, first_name, last_name, email, phone,
            department_id, position, hire_date, salary, status, created_at
          ) VALUES (
            '${context.tenantId}',
            '${employeeNumber}',
            '${firstName.replace(/'/g, "''")}',
            '${lastName.replace(/'/g, "''")}',
            '${email}',
            ${phone ? `'${phone}'` : 'NULL'},
            ${departmentId ? `'${departmentId}'` : 'NULL'},
            ${position ? `'${position.replace(/'/g, "''")}'` : 'NULL'},
            ${hireDate ? `'${hireDate}'` : 'CURRENT_DATE'},
            ${salary || 'NULL'},
            'active',
            NOW()
          ) RETURNING *
        `));
        
        const employee = result.rows[0];
        
        return {
          success: true,
          data: {
            employeeId: employee.id,
            employeeNumber: employee.employee_number,
            name: `${firstName} ${lastName}`,
            message: 'Employee created successfully',
          },
        };
      } catch (error: any) {
        console.error('[create_employee] Error:', error);
        return {
          success: false,
          error: `Error creating employee: ${error.message}`,
        };
      }
    }
  },
  
  {
    name: 'get_employee',
    description: 'Gets detailed information about an employee',
    parameters: [
      { name: 'employeeId', type: 'string', description: 'Employee ID', required: true },
    ],
    execute: async (params: any, context) => {
      const { employeeId } = params;
      
      if (!employeeId) {
        return { success: false, error: 'Employee ID is required' };
      }
      
      try {
        const queryBuilder = new HRQueryBuilder(context.tenantId);
        const employees = await queryBuilder
          .select('employees')
          .where([{ field: 'id', operator: 'eq', value: employeeId }])
          .execute();
        
        if (employees.length === 0) {
          return { success: false, error: 'Employee not found' };
        }
        
        return { success: true, employee: employees[0] };
      } catch (error: any) {
        return { success: false, error: `Error fetching employee: ${error.message}` };
      }
    }
  },
  
  // ==================== DEPARTMENT TOOLS ====================
  
  {
    name: 'list_departments',
    description: 'Lists all departments in the organization',
    parameters: [
      { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 50 },
    ],
    execute: async (params: any, context) => {
      const { limit = 50 } = params;
      
      try {
        const queryBuilder = new HRQueryBuilder(context.tenantId);
        const departments = await queryBuilder
          .select('departments')
          .limit(limit)
          .execute();
        
        return { success: true, departments, total: departments.length };
      } catch (error: any) {
        return { success: false, error: `Error listing departments: ${error.message}` };
      }
    }
  },
  
  {
    name: 'create_department',
    description: 'Creates a new department',
    parameters: [
      { name: 'name', type: 'string', description: 'Department name', required: true },
      { name: 'code', type: 'string', description: 'Department code', required: true },
      { name: 'managerId', type: 'string', description: 'Manager employee ID', required: false },
      { name: 'parentDepartmentId', type: 'string', description: 'Parent department ID', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = createDepartmentSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { name, code, managerId, parentDepartmentId } = validation.data;
      
      try {
        const result = await db.execute(sql.raw(`
          INSERT INTO departments (tenant_id, name, code, manager_id, parent_department_id, created_at)
          VALUES (
            '${context.tenantId}',
            '${name.replace(/'/g, "''")}',
            '${code.replace(/'/g, "''")}',
            ${managerId ? `'${managerId}'` : 'NULL'},
            ${parentDepartmentId ? `'${parentDepartmentId}'` : 'NULL'},
            NOW()
          ) RETURNING *
        `));
        
        const department = result.rows[0];
        
        return {
          success: true,
          data: {
            departmentId: department.id,
            name: department.name,
            code: department.code,
            message: 'Department created successfully',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error creating department: ${error.message}` };
      }
    }
  },
  
  // ==================== ATTENDANCE TOOLS ====================
  
  {
    name: 'clock_in',
    description: 'Records employee clock-in time',
    parameters: [
      { name: 'employeeId', type: 'string', description: 'Employee ID', required: true },
      { name: 'notes', type: 'string', description: 'Optional notes', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = clockInOutSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { employeeId, notes } = validation.data;
      
      try {
        const result = await db.execute(sql.raw(`
          INSERT INTO attendance_records (tenant_id, employee_id, clock_in_time, notes, created_at)
          VALUES (
            '${context.tenantId}',
            '${employeeId}',
            NOW(),
            ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'},
            NOW()
          ) RETURNING *
        `));
        
        const record = result.rows[0];
        
        return {
          success: true,
          data: {
            attendanceId: record.id,
            clockInTime: record.clock_in_time,
            message: 'Clock-in recorded successfully',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error recording clock-in: ${error.message}` };
      }
    }
  },
  
  {
    name: 'clock_out',
    description: 'Records employee clock-out time',
    parameters: [
      { name: 'employeeId', type: 'string', description: 'Employee ID', required: true },
      { name: 'notes', type: 'string', description: 'Optional notes', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = clockInOutSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { employeeId, notes } = validation.data;
      
      try {
        // Find the open attendance record for today
        const result = await db.execute(sql.raw(`
          UPDATE attendance_records
          SET clock_out_time = NOW(), 
              notes = COALESCE(notes, '') || ${notes ? `' | ' || '${notes.replace(/'/g, "''")}'` : "''"},
              updated_at = NOW()
          WHERE tenant_id = '${context.tenantId}'
            AND employee_id = '${employeeId}'
            AND clock_out_time IS NULL
            AND DATE(clock_in_time) = CURRENT_DATE
          RETURNING *
        `));
        
        if (result.rows.length === 0) {
          return { success: false, error: 'No open clock-in record found for today' };
        }
        
        const record = result.rows[0];
        
        return {
          success: true,
          data: {
            attendanceId: record.id,
            clockOutTime: record.clock_out_time,
            message: 'Clock-out recorded successfully',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error recording clock-out: ${error.message}` };
      }
    }
  },
  
  // ==================== LEAVE TOOLS ====================
  
  {
    name: 'create_leave_request',
    description: 'Creates a new leave/time-off request',
    parameters: [
      { name: 'employeeId', type: 'string', description: 'Employee ID', required: true },
      { name: 'leaveType', type: 'string', description: 'Type: vacation, sick, personal, maternity, paternity, unpaid', required: true },
      { name: 'startDate', type: 'string', description: 'Start date (YYYY-MM-DD)', required: true },
      { name: 'endDate', type: 'string', description: 'End date (YYYY-MM-DD)', required: true },
      { name: 'reason', type: 'string', description: 'Reason for leave', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = createLeaveRequestSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { employeeId, leaveType, startDate, endDate, reason } = validation.data;
      
      try {
        const result = await db.execute(sql.raw(`
          INSERT INTO leave_requests (
            tenant_id, employee_id, leave_type, start_date, end_date, reason, status, created_at
          ) VALUES (
            '${context.tenantId}',
            '${employeeId}',
            '${leaveType}',
            '${startDate}',
            '${endDate}',
            ${reason ? `'${reason.replace(/'/g, "''")}'` : 'NULL'},
            'pending',
            NOW()
          ) RETURNING *
        `));
        
        const leaveRequest = result.rows[0];
        
        return {
          success: true,
          data: {
            leaveRequestId: leaveRequest.id,
            status: 'pending',
            message: 'Leave request created successfully',
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error creating leave request: ${error.message}` };
      }
    }
  },
  
  {
    name: 'process_leave_request',
    description: 'Approves or rejects a leave request',
    parameters: [
      { name: 'leaveRequestId', type: 'string', description: 'Leave request ID', required: true },
      { name: 'approved', type: 'boolean', description: 'Whether to approve (true) or reject (false)', required: true },
      { name: 'notes', type: 'string', description: 'Approval/rejection notes', required: false },
    ],
    execute: async (params: any, context) => {
      const validation = processLeaveRequestSchema.safeParse(params);
      if (!validation.success) {
        return { success: false, error: `Validation failed: ${validation.error.message}` };
      }
      
      const { leaveRequestId, approved, notes } = validation.data;
      
      try {
        const status = approved ? 'approved' : 'rejected';
        
        const result = await db.execute(sql.raw(`
          UPDATE leave_requests
          SET status = '${status}',
              approved_by = '${context.userId || ''}',
              approval_date = NOW(),
              approval_notes = ${notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL'},
              updated_at = NOW()
          WHERE tenant_id = '${context.tenantId}'
            AND id = '${leaveRequestId}'
          RETURNING *
        `));
        
        if (result.rows.length === 0) {
          return { success: false, error: 'Leave request not found' };
        }
        
        return {
          success: true,
          data: {
            leaveRequestId,
            status,
            message: `Leave request ${status} successfully`,
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error processing leave request: ${error.message}` };
      }
    }
  },
  
  // ==================== ANALYTICS TOOLS ====================
  
  {
    name: 'get_headcount',
    description: 'Gets current headcount statistics by department and status',
    parameters: [],
    execute: async (params: any, context) => {
      try {
        const result = await db.execute(sql.raw(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'active') as active,
            COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
            COUNT(*) FILTER (WHERE status = 'terminated') as terminated
          FROM employees
          WHERE tenant_id = '${context.tenantId}'
        `));
        
        const byDepartment = await db.execute(sql.raw(`
          SELECT 
            d.name as department,
            COUNT(e.id) as count
          FROM departments d
          LEFT JOIN employees e ON e.department_id = d.id AND e.status = 'active'
          WHERE d.tenant_id = '${context.tenantId}'
          GROUP BY d.id, d.name
          ORDER BY count DESC
        `));
        
        return {
          success: true,
          data: {
            summary: result.rows[0],
            byDepartment: byDepartment.rows,
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error getting headcount: ${error.message}` };
      }
    }
  },
  
  {
    name: 'get_attendance_summary',
    description: 'Gets attendance summary for a date range',
    parameters: [
      { name: 'startDate', type: 'string', description: 'Start date (YYYY-MM-DD)', required: false },
      { name: 'endDate', type: 'string', description: 'End date (YYYY-MM-DD)', required: false },
    ],
    execute: async (params: any, context) => {
      const { startDate, endDate } = params;
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const end = endDate || new Date().toISOString().split('T')[0];
      
      try {
        const result = await db.execute(sql.raw(`
          SELECT 
            DATE(clock_in_time) as date,
            COUNT(*) as records,
            AVG(EXTRACT(EPOCH FROM (clock_out_time - clock_in_time)) / 3600) as avg_hours
          FROM attendance_records
          WHERE tenant_id = '${context.tenantId}'
            AND DATE(clock_in_time) BETWEEN '${start}' AND '${end}'
            AND clock_out_time IS NOT NULL
          GROUP BY DATE(clock_in_time)
          ORDER BY date DESC
        `));
        
        return {
          success: true,
          data: {
            dateRange: { start, end },
            dailySummary: result.rows,
          },
        };
      } catch (error: any) {
        return { success: false, error: `Error getting attendance summary: ${error.message}` };
      }
    }
  },
];

