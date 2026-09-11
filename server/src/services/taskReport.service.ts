/**
 * TaskReportService
 * Single Source of Truth for Task History, Reporting & Spark Intelligence.
 * Used identically by Spark Voice Companion and SHIORI Reports UI.
 */

import { queryOne, queryAll } from '../db/index.js';
import { DateRange, getUserDayRange, getUserWeekRange, getUserMonthRange, extractDayString, normalizeDate, normalizeTimestamp } from '../utils/dateRange.js';


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

  /**
   * Generates the high-fidelity, account-isolated Engineering Weekly Report.
   * Strictly verifies project authorization, isolates repositories, and calculates accurate metrics.
   */
  public async getEngineeringWeeklyReport(
    userId: string,
    options: {
      weekOffset?: number;
      startDate?: string;
      endDate?: string;
      projectId?: string;
      repository?: string;
    } = {}
  ): Promise<any> {
    // 1. Fetch authorized projects for the authenticated user
    const authorizedProjects = await queryAll(`
      SELECT DISTINCT p.id, p.name, p.slug, p.github_repo_name, p.working_mode, p.default_branch, p.workspace_id
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id
      LEFT JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.created_by = ?
         OR pm.user_id = ?
         OR wm.user_id = ?
      ORDER BY p.name ASC
    `, [userId, userId, userId]);

    if (!authorizedProjects || authorizedProjects.length === 0) {
      return this.getEmptyWeeklyReportStructure(options);
    }

    // 2. Validate and filter project scope
    let scopedProjects = [...authorizedProjects];
    if (options.projectId && options.projectId !== 'all') {
      scopedProjects = authorizedProjects.filter((p: any) => p.id === options.projectId);
      if (scopedProjects.length === 0) {
        // User requested an unauthorized project -> return empty safe report
        return this.getEmptyWeeklyReportStructure(options, authorizedProjects);
      }
    }

    const scopedProjectIds = scopedProjects.map((p: any) => p.id);
    let scopedRepoNames = Array.from(
      new Set(scopedProjects.map((p: any) => p.github_repo_name).filter(Boolean))
    );

    if (options.repository && options.repository !== 'all') {
      const selectedLower = options.repository.toLowerCase();
      scopedRepoNames = scopedRepoNames.filter(
        (r: string) => r.toLowerCase() === selectedLower
      );
      if (scopedRepoNames.length === 0) {
        return this.getEmptyWeeklyReportStructure(options, authorizedProjects);
      }
    }

    // 3. Resolve date range (Monday -> Sunday)
    let weekRange: DateRange;
    if (options.startDate && options.endDate) {
      const sDay = extractDayString(options.startDate) || String(options.startDate).slice(0, 10);
      const eDay = extractDayString(options.endDate) || String(options.endDate).slice(0, 10);
      weekRange = {
        start: `${sDay} 00:00:00`,
        end: `${eDay} 23:59:59`,
        startDateStr: sDay,
        endDateStr: eDay,
        label: `${sDay} — ${eDay}`
      };
    } else {
      const offset = typeof options.weekOffset === 'number' ? options.weekOffset : 0;
      weekRange = getUserWeekRange(offset);
    }

    // Determine week number
    const startD = new Date(weekRange.startDateStr);
    const oneJan = new Date(startD.getUTCFullYear(), 0, 1);
    const numberOfDays = Math.floor((startD.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((startD.getDay() + 1 + numberOfDays) / 7);

    // 4. Query tasks scoped strictly to authorized projects
    const placeholders = scopedProjectIds.map(() => '?').join(',');
    const taskParams: any[] = [...scopedProjectIds];

    let repoClause = '';
    if (scopedRepoNames.length > 0) {
      const repoPlaceholders = scopedRepoNames.map(() => '?').join(',');
      repoClause = ` AND (
        t.github_repo IS NULL 
        OR LOWER(t.github_repo) IN (${repoPlaceholders})
        OR LOWER(p.github_repo_name) IN (${repoPlaceholders})
      )`;
      taskParams.push(
        ...scopedRepoNames.map((r) => r.toLowerCase()),
        ...scopedRepoNames.map((r) => r.toLowerCase())
      );
    }

    const allScopedTasks = await queryAll(`
      SELECT t.id, t.task_number, t.task_code, t.title, t.description, t.status, t.priority,
             t.deadline, t.due_date, t.completed_at, t.created_at, t.updated_at,
             t.project_id, t.assignee_id, t.github_repo, t.github_branch,
             p.name as project_name, p.github_repo_name, p.working_mode,
             u.name as assignee_name, u.username as assignee_username, u.github_username as assignee_github_username
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assignee_id = u.id
      WHERE (t.is_deleted = 0 OR t.is_deleted IS NULL)
        AND t.project_id IN (${placeholders})
        ${repoClause}
      ORDER BY t.task_number ASC
    `, taskParams);

    // 5. Tasks completed strictly within this period (USING completed_at ONLY)
    const completedInPeriod = (allScopedTasks || []).filter((t: any) => {
      if (t.status !== 'DONE') return false;
      const compDateStr = extractDayString(t.completed_at);
      if (!compDateStr) return false;
      return compDateStr >= weekRange.startDateStr && compDateStr <= weekRange.endDateStr;
    });

    // 6. Build Daily Completion Bar Chart (Monday to Sunday)
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayShorts = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dailyCompletion: { day: string; date: string; completed: number; tasks: any[] }[] = [];
    const completionTrend: { day: string; date: string; cumulative: number }[] = [];

    let runningCumulative = 0;
    const monDate = new Date(weekRange.startDateStr);

    for (let i = 0; i < 7; i++) {
      const current = new Date(monDate);
      current.setUTCDate(monDate.getUTCDate() + i);
      const dateStr = current.toISOString().split('T')[0];

      const tasksCompletedOnDay = completedInPeriod.filter((t: any) => {
        return extractDayString(t.completed_at) === dateStr;
      });

      const count = tasksCompletedOnDay.length;
      runningCumulative += count;

      dailyCompletion.push({
        day: dayShorts[i],
        date: dateStr,
        completed: count,
        tasks: tasksCompletedOnDay.map((t: any) => ({
          id: t.id,
          task_code: t.task_code,
          title: t.title,
          completed_at: t.completed_at
        }))
      });

      completionTrend.push({
        day: dayShorts[i],
        date: dateStr,
        cumulative: runningCumulative
      });
    }

    // 7. Deadline Performance (Derived Lifecycle States)
    let onTimeCount = 0;
    let lateCount = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;
    let pendingCount = 0;
    const nowMs = Date.now();
    const threeDaysMs = nowMs + (3 * 24 * 60 * 60 * 1000);

    for (const t of (allScopedTasks || [])) {
      const deadlineDate = normalizeTimestamp(t.deadline || t.due_date);

      if (t.status === 'DONE') {
        const completedDate = normalizeTimestamp(t.completed_at);
        if (completedDate && deadlineDate) {
          if (completedDate.getTime() <= deadlineDate.getTime()) {
            onTimeCount++;
          } else {
            lateCount++;
          }
        } else if (completedDate) {
          onTimeCount++;
        }
      } else if (t.status === 'PENDING' || ['IN_PROGRESS', 'IN PROGRESS', 'DOING'].includes(t.status)) {
        if (deadlineDate && deadlineDate.getTime() < nowMs) {
          overdueCount++;
        } else if (deadlineDate && deadlineDate.getTime() <= threeDaysMs) {
          dueSoonCount++;
        } else {
          pendingCount++;
        }
      }
    }

    // 8. Task Status Distribution
    const statusDistribution = {
      done: (allScopedTasks || []).filter((t: any) => t.status === 'DONE').length,
      pending: (allScopedTasks || []).filter((t: any) => t.status === 'PENDING' || ['IN_PROGRESS', 'IN PROGRESS', 'DOING'].includes(t.status)).length,
      needsVerification: (allScopedTasks || []).filter((t: any) => t.status === 'NEEDS_VERIFICATION').length
    };

    // 9. GitHub Activity (Strictly authorized repositories)
    let commits: any[] = [];
    if (scopedRepoNames.length > 0) {
      const repoQ = scopedRepoNames.map(() => '?').join(',');
      const params = [...scopedRepoNames, weekRange.start, weekRange.end];
      commits = await queryAll(`
        SELECT id, repo_name, branch_name, commit_hash, message, author_name, author_username, task_id, pushed_at
        FROM github_commits
        WHERE repo_name IN (${repoQ})
          AND pushed_at >= ? AND pushed_at <= ?
        ORDER BY pushed_at DESC
      `, params);
    }

    const totalCommitsCount = (commits || []).length;
    const verifiedCommitsCount = (commits || []).filter((c: any) => Boolean(c.task_id)).length;
    const unlinkedCommitsCount = totalCommitsCount - verifiedCommitsCount;
    const activeBranchesSet = new Set<string>();
    for (const c of commits) {
      if (c.branch_name) activeBranchesSet.add(c.branch_name);
    }
    for (const p of scopedProjects) {
      if (p.default_branch) activeBranchesSet.add(p.default_branch);
    }

    // Pull requests from task evidence or project
    const prCount = (allScopedTasks || []).filter((t: any) => Boolean(t.github_pr_number)).length;

    // 10. Commit Verification Rate
    const verificationRate = totalCommitsCount > 0
      ? Math.round((verifiedCommitsCount / totalCommitsCount) * 100)
      : 0;

    // 11. Team Contribution / Your Contribution
    const isSolo = scopedProjects.length === 1 && scopedProjects[0].working_mode === 'SOLO';
    const memberMap = new Map<string, { developer: string; username: string; githubUsername: string; tasks: number; commits: number; completed: number }>();

    // Fetch team members for scoped projects
    const members = await queryAll(`
      SELECT pm.project_id, pm.user_id, pm.github_username, u.name, u.username
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id IN (${placeholders})
    `, scopedProjectIds);

    for (const m of (members || [])) {
      memberMap.set(m.user_id, {
        developer: m.name || m.username || 'Developer',
        username: m.username,
        githubUsername: m.github_username || '',
        tasks: 0,
        commits: 0,
        completed: 0
      });
    }

    // Aggregate tasks assigned & completed per member
    for (const t of (allScopedTasks || [])) {
      if (t.assignee_id && memberMap.has(t.assignee_id)) {
        const entry = memberMap.get(t.assignee_id)!;
        entry.tasks++;
        if (t.status === 'DONE') {
          entry.completed++;
        }
      }
    }

    // Aggregate commits per member
    for (const c of (commits || [])) {
      const author = (c.author_username || c.author_name || '').toLowerCase();
      for (const entry of memberMap.values()) {
        if (
          (entry.githubUsername && entry.githubUsername.toLowerCase() === author) ||
          (entry.username && entry.username.toLowerCase() === author) ||
          (entry.developer && entry.developer.toLowerCase() === author)
        ) {
          entry.commits++;
          break;
        }
      }
    }

    const teamContribution = Array.from(memberMap.values());

    // 12. Completion Rate Calculation (completed tasks in period / tasks active or due in period)
    const totalActiveOrDue = completedInPeriod.length + statusDistribution.pending + statusDistribution.needsVerification;
    const completionRate = totalActiveOrDue > 0
      ? Math.round((completedInPeriod.length / totalActiveOrDue) * 100)
      : 0;

    return {
      success: true,
      weekNumber,
      dateRange: {
        start: weekRange.startDateStr,
        end: weekRange.endDateStr,
        label: `${new Date(weekRange.startDateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()} — ${new Date(weekRange.endDateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}`
      },
      summary: {
        tasksCompleted: completedInPeriod.length,
        commits: totalCommitsCount,
        pullRequests: prCount,
        completionRate
      },
      dailyCompletion,
      deadlinePerformance: {
        onTime: onTimeCount,
        late: lateCount,
        overdue: overdueCount,
        dueSoon: dueSoonCount,
        pending: pendingCount
      },
      taskStatus: statusDistribution,
      completionTrend,
      github: {
        commits: totalCommitsCount,
        verifiedCommits: verifiedCommitsCount,
        unlinkedCommits: unlinkedCommitsCount,
        pullRequests: prCount,
        activeBranches: activeBranchesSet.size
      },
      commitVerification: {
        verified: verifiedCommitsCount,
        needsReview: statusDistribution.needsVerification,
        unmatched: unlinkedCommitsCount,
        verificationRate
      },
      isSolo,
      teamContribution,
      authorizedProjects: authorizedProjects.map((p: any) => ({
        id: p.id,
        name: p.name,
        repoName: p.github_repo_name,
        workingMode: p.working_mode
      }))
    };
  }

  /**
   * Helper to return clean, typed empty weekly report structure
   */
  private getEmptyWeeklyReportStructure(options: any, authorizedProjects: any[] = []): any {
    const offset = typeof options.weekOffset === 'number' ? options.weekOffset : 0;
    const weekRange = getUserWeekRange(offset);
    const dayShorts = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const monDate = new Date(weekRange.startDateStr);

    const dailyCompletion = dayShorts.map((d, i) => {
      const current = new Date(monDate);
      current.setUTCDate(monDate.getUTCDate() + i);
      return {
        day: d,
        date: current.toISOString().split('T')[0],
        completed: 0,
        tasks: []
      };
    });

    return {
      success: true,
      weekNumber: 1,
      dateRange: {
        start: weekRange.startDateStr,
        end: weekRange.endDateStr,
        label: `${weekRange.startDateStr} — ${weekRange.endDateStr}`
      },
      summary: {
        tasksCompleted: 0,
        commits: 0,
        pullRequests: 0,
        completionRate: 0
      },
      dailyCompletion,
      deadlinePerformance: {
        onTime: 0,
        late: 0,
        overdue: 0,
        dueSoon: 0,
        pending: 0
      },
      taskStatus: {
        pending: 0,
        needsVerification: 0,
        done: 0
      },
      completionTrend: dailyCompletion.map((dc) => ({ day: dc.day, date: dc.date, cumulative: 0 })),
      github: {
        commits: 0,
        verifiedCommits: 0,
        unlinkedCommits: 0,
        pullRequests: 0,
        activeBranches: 0
      },
      commitVerification: {
        verified: 0,
        needsReview: 0,
        unmatched: 0,
        verificationRate: 0
      },
      isSolo: true,
      teamContribution: [],
      authorizedProjects: (authorizedProjects || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        repoName: p.github_repo_name,
        workingMode: p.working_mode
      }))
    };
  }
}

export const taskReportService = TaskReportService.getInstance();
