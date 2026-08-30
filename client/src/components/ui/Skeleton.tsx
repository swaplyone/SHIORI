import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  variant?: 'rectangular' | 'circular' | 'rounded' | 'text';
  width?: string | number;
  height?: string | number;
}

/**
 * Base E-Ink Skeleton primitive.
 * Matches Shiori paper tones with a subtle, calm paper-shimmer effect.
 * Fully accessible with aria-hidden="true" and prefers-reduced-motion support.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rounded',
  width,
  height,
  style,
  ...props
}) => {
  const getVariantClass = () => {
    switch (variant) {
      case 'circular':
        return 'rounded-full';
      case 'text':
        return 'rounded-xs h-3.5';
      case 'rectangular':
        return 'rounded-none';
      case 'rounded':
      default:
        return 'rounded-xs';
    }
  };

  return (
    <div
      aria-hidden="true"
      className={`eink-skeleton bg-eink-border/30 ${getVariantClass()} ${className}`}
      style={{
        width,
        height,
        ...style
      }}
      {...props}
    />
  );
};

export const SkeletonText: React.FC<{
  lines?: number;
  className?: string;
  lineClassName?: string;
  widths?: (string | number)[];
}> = ({ lines = 2, className = 'space-y-2', lineClassName = '', widths = ['90%', '72%', '84%', '65%'] }) => {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => {
        const width = widths[index % widths.length];
        return (
          <Skeleton
            key={index}
            variant="text"
            className={`h-3 ${lineClassName}`}
            style={{ width }}
          />
        );
      })}
    </div>
  );
};

export const SkeletonTitle: React.FC<{
  className?: string;
  width?: string | number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}> = ({ className = '', width = '55%', size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-3.5',
    md: 'h-4',
    lg: 'h-6',
    xl: 'h-8'
  };

  return (
    <Skeleton
      variant="rounded"
      className={`${sizeClasses[size]} ${className}`}
      style={{ width }}
      aria-hidden="true"
    />
  );
};

export const SkeletonAvatar: React.FC<{
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}> = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
    xl: 'w-14 h-14'
  };

  return (
    <Skeleton
      variant="circular"
      className={`${sizeClasses[size]} shrink-0 ${className}`}
      aria-hidden="true"
    />
  );
};

export const SkeletonButton: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  width?: string | number;
}> = ({ size = 'md', className = '', width = '80px' }) => {
  const sizeClasses = {
    sm: 'h-6',
    md: 'h-7.5',
    lg: 'h-9'
  };

  return (
    <Skeleton
      variant="rounded"
      className={`${sizeClasses[size]} border border-eink-border/40 ${className}`}
      style={{ width }}
      aria-hidden="true"
    />
  );
};

export const SkeletonBadge: React.FC<{
  className?: string;
  width?: string | number;
}> = ({ className = '', width = '50px' }) => {
  return (
    <Skeleton
      variant="rounded"
      className={`h-4.5 border border-eink-border/30 ${className}`}
      style={{ width }}
      aria-hidden="true"
    />
  );
};

export const SkeletonCard: React.FC<{
  className?: string;
  children?: React.ReactNode;
}> = ({ className = '', children }) => {
  return (
    <div
      aria-hidden="true"
      className={`p-5 bg-eink-surface border-2 border-eink-border rounded-sm space-y-4 shadow-eink-sm ${className}`}
    >
      {children}
    </div>
  );
};

export const SkeletonRow: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  return (
    <div
      aria-hidden="true"
      className={`p-4 flex items-center justify-between gap-3 border-b border-eink-border/60 ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Skeleton variant="rounded" className="w-4 h-4 shrink-0" />
        <div className="space-y-1.5 flex-1 min-w-0">
          <SkeletonTitle size="sm" width="45%" />
          <SkeletonText lines={1} widths={['70%']} lineClassName="h-2.5" />
        </div>
      </div>
      <SkeletonBadge width="60px" />
    </div>
  );
};

/* =========================================================================
   DOMAIN SPECIFIC SKELETON LOADERS
   ========================================================================= */

/**
 * Exact layout match for the Home/Dashboard Overview
 */
export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-8 select-none font-sans pb-12" aria-busy="true" aria-label="Loading dashboard...">
      {/* 1. Today Summary Strip */}
      <div className="p-4 bg-eink-surface border-2 border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-technical shadow-eink-sm">
        <div className="space-y-2">
          <SkeletonTitle size="sm" width="130px" />
          <SkeletonTitle size="md" width="280px" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonButton width="110px" />
          <SkeletonButton width="105px" />
        </div>
      </div>

      {/* 2. My Projects Grid */}
      <div className="space-y-4 font-technical">
        <div className="flex items-center justify-between border-b border-eink-border pb-2">
          <div className="flex items-center gap-2">
            <Skeleton variant="rounded" className="w-4 h-4" />
            <SkeletonTitle size="sm" width="120px" />
          </div>
          <SkeletonTitle size="sm" width="180px" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} className="space-y-3.5">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5 flex-1">
                  <SkeletonTitle size="sm" width={i === 1 ? '70%' : i === 2 ? '55%' : '80%'} />
                  <Skeleton variant="text" className="h-2.5 w-32" />
                </div>
                <SkeletonBadge width="54px" />
              </div>

              <div className="space-y-2 border-t border-b border-eink-border/50 py-2.5">
                <div className="flex justify-between">
                  <Skeleton variant="text" className="h-2.5 w-16" />
                  <Skeleton variant="text" className="h-2.5 w-20" />
                </div>
                <div className="flex justify-between">
                  <Skeleton variant="text" className="h-2.5 w-24" />
                  <Skeleton variant="text" className="h-2.5 w-16" />
                </div>
                <Skeleton variant="text" className="h-2 w-44 pt-0.5" />
              </div>

              <div className="flex items-center justify-between pt-1">
                <Skeleton variant="text" className="h-2.5 w-20" />
                <Skeleton variant="text" className="h-3 w-24" />
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>

      {/* 3. SHIORI ID Strip */}
      <div className="p-4 bg-eink-surface border border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-technical">
        <div className="space-y-1.5 flex-1">
          <SkeletonTitle size="sm" width="180px" />
          <Skeleton variant="text" className="h-2.5 w-80" />
        </div>
        <Skeleton variant="rounded" className="h-8 w-44 border border-eink-border/40" />
      </div>
    </div>
  );
};

/**
 * Exact layout match for To-Do Checklist / Tasks List
 */
export const TodoListSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  const titleWidths = ['74%', '88%', '62%', '81%', '69%', '92%', '58%'];

  return (
    <div className="border border-eink-border rounded-sm bg-eink-surface divide-y divide-eink-border overflow-hidden shadow-eink-card" aria-busy="true" aria-label="Loading tasks...">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="p-4 flex items-start sm:items-center justify-between gap-3"
          aria-hidden="true"
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <Skeleton variant="rounded" className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <SkeletonBadge width="56px" />
                <SkeletonTitle size="sm" width={titleWidths[i % titleWidths.length]} />
              </div>
              <div className="flex items-center gap-3 pt-0.5">
                <Skeleton variant="text" className="h-2.5 w-24" />
                <Skeleton variant="text" className="h-2.5 w-16" />
                <Skeleton variant="text" className="h-2.5 w-20" />
              </div>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Skeleton variant="rounded" className="h-5 w-20 border border-eink-border/30" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Exact layout match for Kanban Board columns
 */
export const KanbanBoardSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-technical select-none" aria-busy="true" aria-label="Loading kanban board...">
      {['TODO', 'IN PROGRESS', 'DONE'].map((col, colIdx) => (
        <div
          key={col}
          className="bg-eink-surface/70 border-2 border-eink-border rounded-sm flex flex-col min-h-[500px] shadow-eink-sm"
        >
          {/* Column Header */}
          <div className="p-3 border-b-2 border-eink-border bg-eink-surface flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SkeletonTitle size="sm" width="90px" />
              <SkeletonBadge width="24px" />
            </div>
            <Skeleton variant="rounded" className="w-5 h-5" />
          </div>

          {/* Column Cards */}
          <div className="p-3 space-y-3 flex-1">
            {Array.from({ length: colIdx === 0 ? 3 : colIdx === 1 ? 2 : 1 }).map((_, i) => (
              <div
                key={i}
                className="p-3.5 bg-eink-bg border border-eink-border rounded-sm space-y-2.5 shadow-eink-sm"
              >
                <div className="flex items-center justify-between">
                  <SkeletonBadge width="52px" />
                  <Skeleton variant="rounded" className="w-4 h-4" />
                </div>
                <SkeletonTitle size="sm" width={i % 2 === 0 ? '85%' : '68%'} />
                <div className="flex items-center justify-between pt-1 border-t border-eink-border/40">
                  <Skeleton variant="text" className="h-2 w-16" />
                  <Skeleton variant="text" className="h-2 w-14" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Exact layout match for Project Cards Grid
 */
export const ProjectsGridSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true" aria-label="Loading projects...">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-card flex flex-col justify-between"
          aria-hidden="true"
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 flex-1">
                <Skeleton variant="rounded" className="w-4 h-4 shrink-0" />
                <SkeletonTitle size="sm" width="55%" />
              </div>
              <SkeletonBadge width="45px" />
            </div>

            <SkeletonText lines={2} widths={['95%', '60%']} lineClassName="h-3" />

            {/* GitHub Repo info */}
            <div className="p-2.5 bg-eink-bg border border-eink-border rounded-sm space-y-1.5">
              <Skeleton variant="text" className="h-2 w-28" />
              <div className="flex items-center justify-between">
                <Skeleton variant="text" className="h-3 w-36" />
                <Skeleton variant="text" className="h-2.5 w-20" />
              </div>
            </div>

            {/* Progress breakdown */}
            <div className="space-y-2 pt-2 border-t border-eink-border/60">
              <div className="flex items-center justify-between">
                <Skeleton variant="text" className="h-2.5 w-24" />
                <Skeleton variant="text" className="h-2.5 w-20" />
              </div>
              <Skeleton variant="rounded" className="w-full h-2" />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Skeleton variant="text" className="h-2.5 w-20" />
                <Skeleton variant="text" className="h-2.5 w-20" />
                <Skeleton variant="text" className="h-2.5 w-20" />
                <Skeleton variant="text" className="h-2.5 w-20" />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-eink-border flex items-center justify-between">
            <Skeleton variant="text" className="h-2.5 w-20" />
            <Skeleton variant="text" className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Exact layout match for Connections / Friends list
 */
export const ConnectionsGridSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-technical" aria-busy="true" aria-label="Loading connections...">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-5 bg-eink-surface border-2 border-eink-border rounded-sm space-y-4 shadow-eink-sm"
          aria-hidden="true"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <SkeletonAvatar size="md" />
              <div className="space-y-1">
                <SkeletonTitle size="sm" width="110px" />
                <Skeleton variant="text" className="h-2.5 w-28" />
              </div>
            </div>
            <SkeletonBadge width="60px" />
          </div>

          <div className="p-2.5 bg-eink-bg border border-eink-border rounded-sm space-y-1 font-mono">
            <div className="flex justify-between">
              <Skeleton variant="text" className="h-2.5 w-16" />
              <Skeleton variant="text" className="h-2.5 w-24" />
            </div>
            <div className="flex justify-between">
              <Skeleton variant="text" className="h-2.5 w-20" />
              <Skeleton variant="text" className="h-2.5 w-20" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Skeleton variant="text" className="h-2.5 w-28" />
            <SkeletonButton width="90px" size="sm" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Exact layout match for Journal entries
 */
export const JournalSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 font-technical" aria-busy="true" aria-label="Loading journal...">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="p-5 bg-eink-surface border-2 border-eink-border rounded-sm space-y-3.5 shadow-eink-sm"
          aria-hidden="true"
        >
          <div className="flex items-center justify-between border-b border-eink-border/50 pb-2">
            <div className="flex items-center gap-2">
              <SkeletonBadge width="90px" />
              <SkeletonTitle size="sm" width="140px" />
            </div>
            <SkeletonBadge width="40px" />
          </div>

          <SkeletonText lines={3} widths={['95%', '88%', '72%']} />

          <div className="flex items-center gap-2 pt-2">
            <SkeletonBadge width="60px" />
            <SkeletonBadge width="75px" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Exact layout match for Audit Activity Log rows
 */
export const ActivityLogSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => {
  return (
    <div className="border border-eink-border rounded-sm bg-eink-surface divide-y divide-eink-border overflow-hidden shadow-eink-card" aria-busy="true" aria-label="Loading audit activity...">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex items-center justify-between gap-4" aria-hidden="true">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <SkeletonAvatar size="sm" />
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <SkeletonTitle size="sm" width={i % 2 === 0 ? '40%' : '55%'} />
                <SkeletonBadge width="50px" />
              </div>
              <Skeleton variant="text" className="h-2.5 w-64" />
            </div>
          </div>
          <Skeleton variant="text" className="h-2.5 w-24 shrink-0" />
        </div>
      ))}
    </div>
  );
};

/**
 * Exact layout match for GitHub Hub / Commits / Webhooks
 */
export const GitHubHubSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 font-technical" aria-busy="true" aria-label="Loading GitHub integration...">
      {/* Account Info Box */}
      <div className="p-5 bg-eink-surface border-2 border-eink-border rounded-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SkeletonAvatar size="lg" />
          <div className="space-y-1.5">
            <SkeletonTitle size="md" width="140px" />
            <Skeleton variant="text" className="h-3 w-48" />
          </div>
        </div>
        <SkeletonButton width="120px" />
      </div>

      {/* Commits List */}
      <div className="border border-eink-border rounded-sm bg-eink-surface divide-y divide-eink-border overflow-hidden">
        <div className="p-3 bg-eink-bg border-b border-eink-border">
          <SkeletonTitle size="sm" width="160px" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-3.5 flex items-center justify-between gap-3" aria-hidden="true">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <SkeletonBadge width="65px" />
              <SkeletonTitle size="sm" width={i % 2 === 0 ? '60%' : '45%'} />
            </div>
            <Skeleton variant="text" className="h-2.5 w-28 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};
