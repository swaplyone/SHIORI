/**
 * TaskReportService
 * Single Source of Truth for Task History, Reporting & Spark Intelligence.
 * Used identically by Spark Voice Companion and SHIORI Reports UI.
 */

import { queryOne, queryAll } from '../db/index.js';
import { DateRange, getUserDayRange, getUserWeekRange, getUserMonthRange, extractDayString, normalizeDate } from '../utils/dateRange.js';


export interface TaskFilterOptions {
  projectId?: string;
  status?: string;
  repository?: string;
  assigneeId?: string;
  search?: string;
}

export interface DayCompletionCount {
  dayName: string; // 'Monday', 'Tuesday'...
  dayShort: string; // 'Mon', 'Tue'...
  dateStr: string;  // 'YYYY-MM-DD'
  count: number;
  tasks: any[];
}

export interface ProjectTaskBreakdown {
  projectId: string;
  projectName: string;
  repoName?: string;
  completedCount: number;
  activeCount: number;
  pendingCount: number;
  overdueCount: number;
  totalCount: number;
}

export interface BurnDownPoint {
  dayName: string;
  dateStr: string;
  remainingTasks: number;
  completedTasks: number;
  idealRemaining: number;
}

export class TaskReportService {
  private static instance: TaskReportService | null = null;

  public static getInstance(): TaskReportService {
    if (!TaskReportService.instance) {
      TaskReportService.instance = new TaskReportService();
    }
    return TaskReportService.instance;
  }

  /**
   * Builds SQL WHERE clause with parameter bindings based on filters.
   */
  private buildFilterSql(userId: string, filters: TaskFilterOptions = {}): { whereSql: string; params: any[] } {
    const conditions: string[] = ['(t.is_deleted = 0 OR t.is_deleted IS NULL)'];
    const params: any[] = [];

    if (userId) {
      conditions.push(`(
        t.created_by = ? 
        OR t.assignee_id = ? 
        OR t.project_id IN (
          SELECT id FROM projects WHERE created_by = ? 
          UNION 
          SELECT project_id FROM project_members WHERE user_id = ?
        )
        OR t.workspace_id IN (
          SELECT workspace_id FROM workspace_members WHERE user_id = ?
        )
      )`);
      params.push(userId, userId, userId, userId, userId);
    }

    if (filters.projectId) {
      conditions.push('t.project_id = ?');
      params.push(filters.projectId);
    }

    if (filters.status) {
      conditions.push('t.status = ?');
      params.push(filters.status);
    }

    if (filters.repository) {
      conditions.push('(LOWER(t.github_repo) = LOWER(?) OR LOWER(p.github_repo_name) = LOWER(?))');
      params.push(filters.repository, filters.repository);
    }

    if (filters.assigneeId) {
      conditions.push('t.assignee_id = ?');
      params.push(filters.assigneeId);
    }

    if (filters.search) {
      conditions.push('(LOWER(t.title) LIKE LOWER(?) OR LOWER(t.task_code) LIKE LOWER(?))');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    return {
      whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params
    };
  }

  /**
   * Retrieves completed tasks within a date range (or all-time if dateRange is omitted).
   */
  public async getCompletedTasks(
    userId: string,
    dateRange?: { start: string; end: string },
    filters: TaskFilterOptions = {},
    limit: number = 100
  ): Promise<any[]> {
    const { whereSql, params } = this.buildFilterSql(userId, filters);

    let dateCondition = '';
    const dateParams: any[] = [];

    if (dateRange) {
      // Check completed_at or fallback to updated_at if completed_at was not yet recorded on older rows
      dateCondition = `AND (
        (t.completed_at IS NOT NULL AND t.completed_at >= ? AND t.completed_at <= ?) OR
        (t.completed_at IS NULL AND t.updated_at >= ? AND t.updated_at <= ?)
      )`;
      dateParams.push(dateRange.start, dateRange.end, dateRange.start, dateRange.end);
    }

    const query = `
      SELECT t.id, t.task_code, t.title, t.description, t.status, t.priority,
             t.project_id, t.deadline, t.due_date, t.completed_at, t.updated_at, t.created_at,
             t.github_repo, t.github_branch,
             p.name as project_name, p.github_repo_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      ${whereSql ? whereSql + ' AND' : 'WHERE'} t.status = 'DONE'
      ${dateCondition}
      ORDER BY COALESCE(t.completed_at, t.updated_at) DESC
      LIMIT ${limit}
    `;

    return (await queryAll(query, [...params, ...dateParams])) || [];
  }

  /**
   * Retrieves active / in-progress tasks.
   */
  public async getActiveTasks(userId: string, filters: TaskFilterOptions = {}): Promise<any[]> {
    const { whereSql, params } = this.buildFilterSql(userId, filters);

    const query = `
      SELECT t.id, t.task_code, t.title, t.description, t.status, t.priority,
             t.project_id, t.deadline, t.due_date, t.completed_at, t.updated_at, t.created_at,
             t.github_repo, t.github_branch,
             p.name as project_name, p.github_repo_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      ${whereSql ? whereSql + ' AND' : 'WHERE'} (t.status = 'IN_PROGRESS' OR t.status = 'IN PROGRESS' OR t.status = 'DOING')
      ORDER BY 
        CASE WHEN t.priority = 'URGENT' THEN 1 WHEN t.priority = 'HIGH' THEN 2 WHEN t.priority = 'MEDIUM' THEN 3 ELSE 4 END,
        t.sequence_order ASC,
        t.created_at ASC
    `;

    return (await queryAll(query, params)) || [];
  }

  /**
   * Retrieves overdue tasks (status != DONE and deadline < now).
   */
  public async getOverdueTasks(userId: string, filters: TaskFilterOptions = {}): Promise<any[]> {
    const { whereSql, params } = this.buildFilterSql(userId, filters);

    const query = `
      SELECT t.id, t.task_code, t.title, t.description, t.status, t.priority,
             t.project_id, t.deadline, t.due_date, t.completed_at, t.updated_at, t.created_at,
             t.github_repo, t.github_branch,
             p.name as project_name, p.github_repo_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      ${whereSql ? whereSql + ' AND' : 'WHERE'} t.status != 'DONE'
        AND (
          (t.deadline IS NOT NULL AND t.deadline != '' AND t.deadline < datetime('now')) OR
          (t.due_date IS NOT NULL AND t.due_date != '' AND t.due_date < date('now'))
        )
      ORDER BY COALESCE(t.deadline, t.due_date) ASC
    `;

    return (await queryAll(query, params)) || [];
  }

  /**
   * Retrieves pending tasks (status != DONE and not currently active).
   */
  public async getPendingTasks(userId: string, filters: TaskFilterOptions = {}): Promise<any[]> {
    const { whereSql, params } = this.buildFilterSql(userId, filters);

    const query = `
      SELECT t.id, t.task_code, t.title, t.description, t.status, t.priority,
             t.project_id, t.deadline, t.due_date, t.completed_at, t.updated_at, t.created_at,
             t.github_repo, t.github_branch,
             p.name as project_name, p.github_repo_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      ${whereSql ? whereSql + ' AND' : 'WHERE'} t.status != 'DONE'
        AND t.status NOT IN ('IN_PROGRESS', 'IN PROGRESS', 'DOING')
      ORDER BY 
        CASE WHEN t.priority = 'URGENT' THEN 1 WHEN t.priority = 'HIGH' THEN 2 WHEN t.priority = 'MEDIUM' THEN 3 ELSE 4 END,
        t.sequence_order ASC,
        t.created_at ASC
    `;

    return (await queryAll(query, params)) || [];
  }

  /**
   * Retrieves tasks due within a date range.
   */
  public async getDueTasks(userId: string, dateRange: { start: string; end: string }, filters: TaskFilterOptions = {}): Promise<any[]> {
    const { whereSql, params } = this.buildFilterSql(userId, filters);

    const query = `
      SELECT t.id, t.task_code, t.title, t.description, t.status, t.priority,
             t.project_id, t.deadline, t.due_date, t.completed_at, t.updated_at, t.created_at,
             p.name as project_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      ${whereSql ? whereSql + ' AND' : 'WHERE'} t.status != 'DONE'
        AND (
          (t.deadline IS NOT NULL AND t.deadline >= ? AND t.deadline <= ?) OR
          (t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ?)
        )
      ORDER BY COALESCE(t.deadline, t.due_date) ASC
    `;

    return (await queryAll(query, [...params, dateRange.start, dateRange.end, extractDayString(dateRange.start), extractDayString(dateRange.end)])) || [];
  }

  /**
   * Generates a comprehensive Weekly Report.
   */
  public async getWeeklyReport(userId: string, weekOffset: number = 0, filters: TaskFilterOptions = {}): Promise<any> {
    const weekRange = getUserWeekRange(weekOffset);
    const completed = await this.getCompletedTasks(userId, { start: weekRange.start, end: weekRange.end }, filters);
    const active = await this.getActiveTasks(userId, filters);
    const overdue = await this.getOverdueTasks(userId, filters);
    const pending = await this.getPendingTasks(userId, filters);
    const dueThisWeek = await this.getDueTasks(userId, { start: weekRange.start, end: weekRange.end }, filters);

    // Group completed tasks into Monday -> Sunday
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayShorts = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const monDate = new Date(weekRange.startDateStr);
    const days: DayCompletionCount[] = [];

    for (let i = 0; i < 7; i++) {
      const current = new Date(monDate);
      current.setDate(monDate.getDate() + i);
      const dateStr = current.toISOString().split('T')[0];

      const tasksForDay = completed.filter(t => {
        const compDate = extractDayString(t.completed_at || t.updated_at);
        return compDate === dateStr;
      });

      days.push({
        dayName: dayNames[i],
        dayShort: dayShorts[i],
        dateStr,
        count: tasksForDay.length,
        tasks: tasksForDay
      });
    }

    // Project breakdown
    const projectMap = new Map<string, ProjectTaskBreakdown>();
    const allRelevantTasks = [...completed, ...active, ...pending, ...overdue];

    for (const t of allRelevantTasks) {
      const pId = t.project_id || 'unassigned';
      const pName = t.project_name || 'Standalone / Workspace';
      const repo = t.github_repo || t.github_repo_name || undefined;

      if (!projectMap.has(pId)) {
        projectMap.set(pId, {
          projectId: pId,
          projectName: pName,
          repoName: repo,
          completedCount: 0,
          activeCount: 0,
          pendingCount: 0,
          overdueCount: 0,
          totalCount: 0
        });
      }

      const item = projectMap.get(pId)!;
      item.totalCount++;
      if (t.status === 'DONE') item.completedCount++;
      else if (['IN_PROGRESS', 'IN PROGRESS', 'DOING'].includes(t.status)) item.activeCount++;
      else item.pendingCount++;

      if (t.status !== 'DONE' && t.deadline && new Date(t.deadline).getTime() < Date.now()) {
        item.overdueCount++;
      }
    }

    // Repository breakdown
    const repoMap = new Map<string, { repoName: string; completedCount: number; activeCount: number; totalCount: number }>();
    for (const t of allRelevantTasks) {
      const repo = t.github_repo || t.github_repo_name || 'No Repository';
      if (!repoMap.has(repo)) {
        repoMap.set(repo, { repoName: repo, completedCount: 0, activeCount: 0, totalCount: 0 });
      }
      const rItem = repoMap.get(repo)!;
      rItem.totalCount++;
      if (t.status === 'DONE') rItem.completedCount++;
      else if (['IN_PROGRESS', 'IN PROGRESS', 'DOING'].includes(t.status)) rItem.activeCount++;
    }

    // Calculate completion percentage
    const totalWeekTasks = completed.length + active.length + pending.length;
    const completionRate = totalWeekTasks > 0 ? Math.round((completed.length / totalWeekTasks) * 100) : 0;

    // Burn-down data
    const burndown = await this.getBurnDownData(userId, weekRange.startDateStr, weekRange.endDateStr);

    return {
      timeframe: weekOffset === 0 ? 'this_week' : 'last_week',
      dateRange: weekRange,
      metrics: {
        completedCount: completed.length,
        activeCount: active.length,
        overdueCount: overdue.length,
        pendingCount: pending.length,
        dueThisWeekCount: dueThisWeek.length,
        completionRate
      },
      days,
      completedTasks: completed,
      activeTasks: active,
      overdueTasks: overdue,
      dueTasks: dueThisWeek,
      projectBreakdown: Array.from(projectMap.values()),
      repositoryBreakdown: Array.from(repoMap.values()),
      burndown
    };
  }

  /**
   * Generates Daily Report for today or a specific date.
   */
  public async getDailyReport(userId: string, targetDate?: string, filters: TaskFilterOptions = {}): Promise<any> {
    const dayRange = getUserDayRange(targetDate);
    const completed = await this.getCompletedTasks(userId, { start: dayRange.start, end: dayRange.end }, filters);
    const active = await this.getActiveTasks(userId, filters);
    const overdue = await this.getOverdueTasks(userId, filters);
    const dueToday = await this.getDueTasks(userId, { start: dayRange.start, end: dayRange.end }, filters);
    const pending = await this.getPendingTasks(userId, filters);

    return {
      timeframe: 'daily',
      dateRange: dayRange,
      metrics: {
        completedCount: completed.length,
        activeCount: active.length,
        overdueCount: overdue.length,
        dueTodayCount: dueToday.length,
        pendingCount: pending.length
      },
      completedTasks: completed,
      activeTasks: active,
      overdueTasks: overdue,
      dueTasks: dueToday
    };
  }

  /**
   * Computes real-data burn-down curve across days.
   */
  public async getBurnDownData(userId: string, weekStart: string, weekEnd: string): Promise<BurnDownPoint[]> {
    const { whereSql, params } = this.buildFilterSql(userId);
    const allTasks = await queryAll(
      `SELECT t.id, t.created_at, t.completed_at, t.updated_at, t.status 
       FROM tasks t
       ${whereSql}`,
      params
    );

    const monDate = new Date(weekStart);
    const points: BurnDownPoint[] = [];
    const totalScope = (allTasks || []).length;
    const dayShorts = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
      const current = new Date(monDate);
      current.setDate(monDate.getDate() + i);
      const dateStr = current.toISOString().split('T')[0];
      const endOfDay = `${dateStr} 23:59:59`;

      // Completed on or before this day
      const completedSoFar = (allTasks || []).filter(t => {
        if (t.status !== 'DONE') return false;
        const comp = normalizeDate(t.completed_at || t.updated_at);
        return !!comp && comp <= endOfDay;
      }).length;

      const remaining = Math.max(0, totalScope - completedSoFar);
      const idealRemaining = Math.max(0, Math.round(totalScope - (totalScope / 7) * (i + 1)));

      points.push({
        dayName: dayShorts[i],
        dateStr,
        remainingTasks: remaining,
        completedTasks: completedSoFar,
        idealRemaining
      });
    }

    return points;
  }
}

export const taskReportService = TaskReportService.getInstance();
