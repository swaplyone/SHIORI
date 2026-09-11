import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { taskReportService, TaskFilterOptions } from '../services/taskReport.service.js';
import { getUserDayRange, getUserWeekRange, getUserMonthRange } from '../utils/dateRange.js';

export const reportsRouter = Router();

// GET /api/reports/summary — Comprehensive Report (Daily / Weekly / Monthly / Custom)
reportsRouter.get('/summary', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const {
      timeframe = 'this_week',
      startDate,
      endDate,
      targetDate,
      weekOffset,
      monthOffset,
      projectId,
      status,
      repository,
      search
    } = req.query;

    const filters: TaskFilterOptions = {
      projectId: projectId as string,
      status: status as string,
      repository: repository as string,
      search: search as string
    };

    if (timeframe === 'today' || timeframe === 'yesterday' || timeframe === 'daily') {
      const dateToUse = timeframe === 'yesterday' 
        ? new Date(Date.now() - 86400000).toISOString().split('T')[0]
        : (targetDate as string);
      
      const report = await taskReportService.getDailyReport(userId, dateToUse, filters);
      res.json({ success: true, ...report });
      return;
    }

    if (timeframe === 'last_week' || timeframe === 'this_week' || timeframe === 'weekly') {
      const offset = timeframe === 'last_week' ? -1 : (weekOffset ? parseInt(weekOffset as string, 10) : 0);
      const report = await taskReportService.getWeeklyReport(userId, offset, filters);
      res.json({ success: true, ...report });
      return;
    }

    if (timeframe === 'this_month' || timeframe === 'last_month' || timeframe === 'monthly') {
      const offset = timeframe === 'last_month' ? -1 : (monthOffset ? parseInt(monthOffset as string, 10) : 0);
      const monthRange = getUserMonthRange(offset);
      const completed = await taskReportService.getCompletedTasks(userId, { start: monthRange.start, end: monthRange.end }, filters);
      const active = await taskReportService.getActiveTasks(userId, filters);
      const overdue = await taskReportService.getOverdueTasks(userId, filters);

      res.json({
        success: true,
        timeframe: timeframe === 'last_month' ? 'last_month' : 'this_month',
        dateRange: monthRange,
        metrics: {
          completedCount: completed.length,
          activeCount: active.length,
          overdueCount: overdue.length,
          completionRate: (completed.length + active.length) > 0 ? Math.round((completed.length / (completed.length + active.length)) * 100) : 0
        },
        completedTasks: completed,
        activeTasks: active,
        overdueTasks: overdue
      });
      return;
    }

    // Custom Date Range
    if (startDate && endDate) {
      const customRange = {
        start: `${startDate} 00:00:00`,
        end: `${endDate} 23:59:59`,
        startDateStr: startDate as string,
        endDateStr: endDate as string,
        label: `Custom (${startDate} - ${endDate})`
      };

      const completed = await taskReportService.getCompletedTasks(userId, { start: customRange.start, end: customRange.end }, filters);
      const active = await taskReportService.getActiveTasks(userId, filters);
      const overdue = await taskReportService.getOverdueTasks(userId, filters);

      res.json({
        success: true,
        timeframe: 'custom',
        dateRange: customRange,
        metrics: {
          completedCount: completed.length,
          activeCount: active.length,
          overdueCount: overdue.length
        },
        completedTasks: completed,
        activeTasks: active,
        overdueTasks: overdue
      });
      return;
    }

    // Default to this week
    const report = await taskReportService.getWeeklyReport(userId, 0, filters);
    res.json({ success: true, ...report });
  } catch (err: any) {
    console.error('[REPORTS API ERROR]', err);
    res.status(500).json({ error: 'Failed to generate report', details: err.message });
  }
});

// GET /api/reports/burndown — Weekly Burn-Down Chart Data
reportsRouter.get('/burndown', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const weekOffset = req.query.weekOffset ? parseInt(req.query.weekOffset as string, 10) : 0;
    const weekRange = getUserWeekRange(weekOffset);
    const burndown = await taskReportService.getBurnDownData(userId, weekRange.startDateStr, weekRange.endDateStr);
    res.json({ success: true, dateRange: weekRange, burndown });
  } catch (err: any) {
    console.error('[BURNDOWN API ERROR]', err);
    res.status(500).json({ error: 'Failed to generate burndown chart', details: err.message });
  }
});

// GET /api/reports/weekly — Engineering Weekly Report (Account-Isolated, Project & Repo Scoped)
reportsRouter.get('/weekly', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const {
      weekOffset,
      startDate,
      endDate,
      projectId,
      repository
    } = req.query;

    const report = await taskReportService.getEngineeringWeeklyReport(userId, {
      weekOffset: weekOffset !== undefined ? parseInt(weekOffset as string, 10) : 0,
      startDate: startDate as string,
      endDate: endDate as string,
      projectId: projectId as string,
      repository: repository as string
    });

    res.json(report);
  } catch (err: any) {
    console.error('[WEEKLY REPORT API ERROR]', err);
    res.status(500).json({ error: 'Failed to generate weekly engineering report', details: err.message });
  }
});

