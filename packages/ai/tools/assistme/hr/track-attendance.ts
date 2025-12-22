import { ToolBase } from '../../kernel/base';
import { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import { db } from '../../../../../apps/api/db';
import { attendance, employees } from 'shared/schema';
import { and, eq } from 'drizzle-orm';

export class TrackAttendanceTool extends ToolBase {
  manifest: ToolManifest = {
    name: 'track_attendance',
    category: 'hr' as const,
    scope: 'tenant' as const,
    description: 'Regista presença ou ausência de um funcionário',
    parameters: [
      {
        name: 'employeeId',
        type: 'string',
        description: 'ID do funcionário',
        required: true
      },
      {
        name: 'date',
        type: 'string',
        description: 'Data (YYYY-MM-DD)',
        required: true
      },
      {
        name: 'status',
        type: 'string',
        description: 'Status (Presente/Ausente/Falta)',
        required: true
      },
      {
        name: 'checkIn',
        type: 'string',
        description: 'Hora de entrada (HH:MM)',
        required: false
      },
      {
        name: 'checkOut',
        type: 'string',
        description: 'Hora de saída (HH:MM)',
        required: false
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Notas adicionais',
        required: false
      }
    ],
    outputSchema: z.object({
      attendanceId: z.string(),
      employeeName: z.string(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: false
  };

  async executeInternal(
    input: { 
      employeeId: string;
      date: string;
      status: string;
      checkIn?: string;
      checkOut?: string;
      notes?: string;
    },
    context: ToolExecutionContext
  ) {
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.id, input.employeeId),
        eq(employees.tenantId, context.tenantId)
      )
    });

    if (!employee) {
      throw new Error('Funcionário não encontrado ou sem permissão');
    }

    const attendanceDate = new Date(input.date);
    let checkInTime = input.checkIn ? new Date(`${input.date}T${input.checkIn}:00`) : undefined;
    let checkOutTime = input.checkOut ? new Date(`${input.date}T${input.checkOut}:00`) : undefined;

    const [record] = await db.insert(attendance).values({
      tenantId: context.tenantId,
      employeeId: input.employeeId,
      date: attendanceDate,
      checkIn: checkInTime,
      checkOut: checkOutTime,
      status: input.status,
      notes: input.notes
    }).returning();

    return {
      attendanceId: record.id,
      employeeName: employee.fullName,
      message: `Presença registada para ${employee.fullName} em ${input.date}`
    };
  }
}
