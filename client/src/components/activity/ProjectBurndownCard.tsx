import React, { useState, useEffect } from 'react';
import { TrendingDown, Filter, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface BurndownPoint {
  dateLabel: string;
  fullDate: string;
  remaining: number | null;
  ideal: number;
  completed: number | null;
  total: number;
  isToday: boolean;
  isFuture: boolean;
}

interface BurndownData {
  points: BurndownPoint[];
  totalTasks: number;
  completedTasks: number;
  remainingTasks: number;
  startDate: string | null;
  targetDate: string | null;
  hasTasks: boolean;
}

interface ProjectOption {
  id: string;
  name: string;
  slug?: string;
}

export const ProjectBurndownCard: React.FC<{ projects: ProjectOption[] }> = ({ projects }) => {
  const { token } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [burndown, setBurndown] = useState<BurndownData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [hoveredPoint, setHoveredPoint] = useState<BurndownPoint | null>(null);

  const fetchBurndown = async (projId: string) => {
    if (!token) return;
    try {
      setLoading(true);
      const url = projId === 'ALL' ? '/api/activity/burndown' : `/api/activity/burndown?projectId=${projId}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBurndown(data);
      }
    } catch (err) {
      console.error('Failed to load burndown data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBurndown(selectedProjectId);
  }, [selectedProjectId, token]);

  const points = burndown?.points || [];
  const validActualPoints = points.filter((p) => p.remaining !== null);

  // SVG Chart Geometry
  const width = 640;
  const height = 220;
  const padding = { top: 25, right: 30, bottom: 35, left: 35 };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Max Y value
  const maxY = Math.max(1, burndown?.totalTasks || 5);

  const getX = (index: number, total: number) => {
    if (total <= 1) return padding.left + innerWidth / 2;
    return padding.left + (index / (total - 1)) * innerWidth;
  };

  const getY = (val: number) => {
    return padding.top + innerHeight - (val / maxY) * innerHeight;
  };

  // Build SVG Paths
  const idealPath = points.length > 1
    ? points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx, points.length)} ${getY(p.ideal)}`).join(' ')
    : '';

  const actualPath = validActualPoints.length > 0
    ? validActualPoints.map((p, idx) => {
        const originalIndex = points.findIndex((pt) => pt.fullDate === p.fullDate);
        return `${idx === 0 ? 'M' : 'L'} ${getX(originalIndex, points.length)} ${getY(p.remaining!)}`;
      }).join(' ')
    : '';

  return (
    <div className="border border-eink-border rounded-sm bg-eink-surface p-4 sm:p-5 shadow-eink-card font-technical space-y-4 select-none">
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-eink-border pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-eink-text" />
            <h3 className="font-bold text-sm text-eink-text uppercase tracking-wider">
              Project Burndown
            </h3>
          </div>
          <p className="text-[11px] text-eink-textSecondary font-sans">
            Remaining work over time
          </p>
        </div>

        {/* Project Selector & Scope */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {projects.length > 0 && (
            <div className="flex items-center gap-1.5 bg-eink-bg border border-eink-border rounded-sm px-2 py-1">
              <Filter className="w-3 h-3 text-eink-textMuted shrink-0" />
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-transparent text-xs font-mono font-bold text-eink-text outline-none cursor-pointer"
              >
                <option value="ALL">ALL PROJECTS</option>
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="p-2 bg-eink-bg border border-eink-border rounded-sm">
          <span className="text-[10px] text-eink-textMuted uppercase block">Remaining</span>
          <span className="font-bold text-base text-eink-text font-mono">
            {burndown?.remainingTasks ?? 0}
          </span>
        </div>
        <div className="p-2 bg-eink-bg border border-eink-border rounded-sm">
          <span className="text-[10px] text-eink-textMuted uppercase block">Completed</span>
          <span className="font-bold text-base text-eink-text font-mono">
            {burndown?.completedTasks ?? 0}
          </span>
        </div>
        <div className="p-2 bg-eink-bg border border-eink-border rounded-sm">
          <span className="text-[10px] text-eink-textMuted uppercase block">Total Scope</span>
          <span className="font-bold text-base text-eink-text font-mono">
            {burndown?.totalTasks ?? 0}
          </span>
        </div>
      </div>

      {/* Burndown Vector Graph Area */}
      <div className="relative bg-eink-bg border border-eink-border rounded-sm p-2 sm:p-3 overflow-hidden">
        {loading ? (
          <div className="h-48 flex items-center justify-center text-xs text-eink-textMuted font-mono animate-pulse">
            Calculating burndown velocity...
          </div>
        ) : !burndown?.hasTasks || points.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-4 space-y-1.5 text-xs text-eink-textMuted">
            <AlertCircle className="w-5 h-5 opacity-60" />
            <span className="font-bold uppercase">No Tasks in Project</span>
            <p className="text-[11px] text-eink-textSecondary font-sans">
              Create tasks in this project to track the live burndown chart.
            </p>
          </div>
        ) : (
          <div className="w-full">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto max-h-56 overflow-visible text-eink-text"
            >
              {/* Horizontal Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const yPos = padding.top + innerHeight * (1 - ratio);
                const labelVal = Math.round(maxY * ratio);
                return (
                  <g key={idx} className="opacity-30">
                    <line
                      x1={padding.left}
                      y1={yPos}
                      x2={width - padding.right}
                      y2={yPos}
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                    <text
                      x={padding.left - 6}
                      y={yPos + 3}
                      textAnchor="end"
                      fontSize="9"
                      fill="currentColor"
                      fontFamily="monospace"
                    >
                      {labelVal}
                    </text>
                  </g>
                );
              })}

              {/* Ideal Reference Line (Dashed) */}
              {idealPath && (
                <path
                  d={idealPath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="4,4"
                  className="opacity-40"
                />
              )}

              {/* Actual Remaining Line (Solid Bold) */}
              {actualPath && (
                <path
                  d={actualPath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Actual Data Points */}
              {validActualPoints.map((p) => {
                const originalIndex = points.findIndex((pt) => pt.fullDate === p.fullDate);
                const cx = getX(originalIndex, points.length);
                const cy = getY(p.remaining!);
                const isHovered = hoveredPoint?.fullDate === p.fullDate;

                return (
                  <g key={p.fullDate}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 5.5 : p.isToday ? 4.5 : 3.5}
                      className={`transition-all cursor-pointer ${
                        p.isToday
                          ? 'fill-eink-text stroke-eink-bg stroke-2'
                          : 'fill-eink-bg stroke-eink-text stroke-2'
                      }`}
                      onMouseEnter={() => setHoveredPoint(p)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                  </g>
                );
              })}

              {/* X-axis Date Labels (Sampled to prevent clutter) */}
              {points.map((p, idx) => {
                const total = points.length;
                // Show first, last, today, and evenly spaced labels
                const shouldShow =
                  idx === 0 ||
                  idx === total - 1 ||
                  p.isToday ||
                  (total > 6 && idx % Math.ceil(total / 5) === 0);

                if (!shouldShow) return null;

                const cx = getX(idx, total);
                return (
                  <text
                    key={p.fullDate}
                    x={cx}
                    y={height - 10}
                    textAnchor="middle"
                    fontSize="9"
                    fill="currentColor"
                    fontFamily="monospace"
                    className={p.isToday ? 'font-bold underline' : 'opacity-70'}
                  >
                    {p.dateLabel}
                  </text>
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredPoint && (
              <div className="mt-2 p-2 bg-eink-surface border border-eink-border rounded text-[11px] font-mono flex items-center justify-between animate-fade-in">
                <span>
                  <strong>{hoveredPoint.dateLabel}</strong> ({hoveredPoint.fullDate})
                </span>
                <span className="text-eink-textSecondary">
                  Remaining: <strong>{hoveredPoint.remaining}</strong> · Completed: {hoveredPoint.completed} · Ideal Target: {hoveredPoint.ideal}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend & Date Bounds */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-[10px] font-mono text-eink-textSecondary">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-eink-text inline-block" />
            <span>Actual Remaining</span>
          </div>
          <div className="flex items-center gap-1.5 opacity-60">
            <span className="w-3 h-0.5 border-b border-dashed border-eink-text inline-block" />
            <span>Ideal Burndown</span>
          </div>
        </div>

        {burndown?.startDate && burndown?.targetDate && (
          <span className="text-eink-textMuted">
            Range: {burndown.startDate} → {burndown.targetDate}
          </span>
        )}
      </div>
    </div>
  );
};
