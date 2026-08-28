import React, { useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useMorphBar } from '../../context/MorphBarContext';

import { IdleCollapsedView, NavigationExpandedView } from './states/IdleStateView';
import { FocusCollapsedView, FocusExpandedView } from './states/FocusStateView';
import { GitHubCollapsedView, GitHubExpandedView } from './states/GitHubStateView';
import {
  BuildErrorCollapsedView,
  BuildErrorExpandedView,
  BuildSuccessCollapsedView,
} from './states/BuildErrorStateView';
import { TaskCollapsedView, TaskExpandedView } from './states/TaskStateView';
import { ConnectionCollapsedView, ConnectionExpandedView } from './states/ConnectionStateView';
import { OtpCollapsedView, OtpExpandedView } from './states/OtpStateView';
import { WorkspaceCollapsedView, WorkspaceExpandedView } from './states/WorkspaceStateView';

export const MorphBar: React.FC = () => {
  const { currentEvent, isExpanded, collapseMorphBar, toggleExpand, barPosition, isBarVisible } =
    useMorphBar();
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const prevPathRef = useRef(location.pathname);

  // Close only when route actually changes
  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      collapseMorphBar();
    }
  }, [location.pathname, collapseMorphBar]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        isExpanded &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        collapseMorphBar();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isExpanded, collapseMorphBar]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        collapseMorphBar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, collapseMorphBar]);

  // Precise discrete dimensions for butter-smooth CSS interpolation
  const getPillDimensions = () => {
    if (isExpanded) {
      return 'w-[94vw] sm:w-[580px] md:w-[640px] max-w-2xl rounded-lg p-4 shadow-2xl';
    }

    switch (currentEvent.type) {
      case 'IDLE': {
        const isHome = location.pathname === '/';
        return isHome
          ? 'w-[145px] h-[42px] rounded-full px-3.5 shadow-eink-sm hover:scale-[1.03] active:scale-[0.98] cursor-pointer'
          : 'w-[260px] sm:w-[285px] h-[42px] rounded-full px-3.5 shadow-eink-sm hover:scale-[1.03] active:scale-[0.98] cursor-pointer';
      }
      case 'FOCUS_TIMER':
        return 'w-[240px] sm:w-[260px] h-[42px] rounded-full px-3 shadow-eink-sm hover:scale-[1.03] active:scale-[0.98] cursor-pointer';
      case 'GITHUB_COMMIT':
        return 'w-[300px] sm:w-[340px] h-[42px] rounded-full px-3 shadow-eink-sm hover:scale-[1.03] active:scale-[0.98] cursor-pointer';
      case 'BUILD_ERROR':
        return 'w-[280px] sm:w-[320px] h-[42px] rounded-full px-3 shadow-eink-sm hover:scale-[1.03] active:scale-[0.98] cursor-pointer bg-eink-surface';
      case 'BUILD_SUCCESS':
        return 'w-[260px] sm:w-[290px] h-[42px] rounded-full px-3 shadow-eink-sm hover:scale-[1.03] active:scale-[0.98] cursor-pointer';
      case 'TASK_VERIFICATION':
        return 'w-[290px] sm:w-[330px] h-[42px] rounded-full px-3 shadow-eink-sm hover:scale-[1.03] active:scale-[0.98] cursor-pointer';
      case 'CONNECTION_REQUEST':
        return 'w-[290px] sm:w-[330px] h-[42px] rounded-full px-3 shadow-eink-sm hover:scale-[1.03] active:scale-[0.98] cursor-pointer';
      case 'OTP_VERIFICATION':
        return 'w-[270px] sm:w-[300px] h-[42px] rounded-full px-3 shadow-eink-sm hover:scale-[1.03] active:scale-[0.98] cursor-pointer';
      case 'WORKSPACE_INVITATION':
        return 'w-[290px] sm:w-[330px] h-[42px] rounded-full px-3 shadow-eink-sm hover:scale-[1.03] active:scale-[0.98] cursor-pointer';
      default:
        return 'w-[220px] h-[42px] rounded-full px-3 shadow-eink-sm cursor-pointer';
    }
  };

  const renderCollapsedContent = () => {
    switch (currentEvent.type) {
      case 'IDLE':
        return <IdleCollapsedView />;
      case 'FOCUS_TIMER':
        return <FocusCollapsedView />;
      case 'GITHUB_COMMIT':
        return <GitHubCollapsedView data={currentEvent.data} />;
      case 'BUILD_ERROR':
        return <BuildErrorCollapsedView data={currentEvent.data} />;
      case 'BUILD_SUCCESS':
        return <BuildSuccessCollapsedView data={currentEvent.data} />;
      case 'TASK_VERIFICATION':
        return <TaskCollapsedView data={currentEvent.data} />;
      case 'CONNECTION_REQUEST':
        return <ConnectionCollapsedView data={currentEvent.data} />;
      case 'OTP_VERIFICATION':
        return <OtpCollapsedView data={currentEvent.data} />;
      case 'WORKSPACE_INVITATION':
        return <WorkspaceCollapsedView data={currentEvent.data} />;
      default:
        return <IdleCollapsedView />;
    }
  };

  const renderExpandedContent = () => {
    switch (currentEvent.type) {
      case 'IDLE':
      case 'NAVIGATION':
        return <NavigationExpandedView onClose={collapseMorphBar} />;
      case 'FOCUS_TIMER':
        return <FocusExpandedView onClose={collapseMorphBar} />;
      case 'GITHUB_COMMIT':
        return <GitHubExpandedView data={currentEvent.data} onClose={collapseMorphBar} />;
      case 'BUILD_ERROR':
        return <BuildErrorExpandedView data={currentEvent.data} onClose={collapseMorphBar} />;
      case 'TASK_VERIFICATION':
        return <TaskExpandedView data={currentEvent.data} onClose={collapseMorphBar} />;
      case 'CONNECTION_REQUEST':
        return <ConnectionExpandedView data={currentEvent.data} onClose={collapseMorphBar} />;
      case 'OTP_VERIFICATION':
        return <OtpExpandedView data={currentEvent.data} onClose={collapseMorphBar} />;
      case 'WORKSPACE_INVITATION':
        return <WorkspaceExpandedView data={currentEvent.data} onClose={collapseMorphBar} />;
      default:
        return <NavigationExpandedView onClose={collapseMorphBar} />;
    }
  };

  const getHeaderTitle = () => {
    switch (currentEvent.type) {
      case 'IDLE':
      case 'NAVIGATION':
        return 'SHIORI WORKSPACE HUB';
      case 'FOCUS_TIMER':
        return 'FOCUS SESSION';
      case 'GITHUB_COMMIT':
        return 'GITHUB ACTIVITY';
      case 'BUILD_ERROR':
        return 'BUILD FAILED';
      case 'TASK_VERIFICATION':
        return 'TASK EVIDENCE';
      case 'CONNECTION_REQUEST':
        return 'CONNECTION REQUEST';
      case 'OTP_VERIFICATION':
        return 'CONNECTION VERIFICATION';
      case 'WORKSPACE_INVITATION':
        return 'WORKSPACE INVITATION';
      default:
        return 'SHIORI';
    }
  };

  if (!isBarVisible) return null;

  const isCenter = barPosition === 'center';

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 z-50 select-none transform-gpu transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isCenter ? 'top-[44vh] -translate-y-1/2' : 'top-2.5 sm:top-3.5 translate-y-0'
      }`}
    >
      <div
        ref={containerRef}
        onClick={!isExpanded ? toggleExpand : undefined}
        className={`
          relative bg-eink-bg text-eink-text border border-eink-border
          flex flex-col justify-center overflow-hidden
          transition-[width,height,border-radius,box-shadow,transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${getPillDimensions()}
        `}
      >
        {/* Subtle Paper Grain / Dither overlay */}
        <div className="absolute inset-0 bg-paper-texture opacity-3 pointer-events-none rounded-[inherit]" />

        {isExpanded ? (
          <div className="w-full space-y-3 font-island animate-in fade-in duration-200 ease-out">
            {/* Expanded Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-eink-border">
              <div className="flex items-center gap-2">
                <span className="font-island font-bold text-sm uppercase tracking-wider text-eink-text">
                  {getHeaderTitle()}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  collapseMorphBar();
                }}
                className="p-1 text-eink-textMuted hover:text-eink-text rounded hover:bg-eink-surface transition-colors"
                title="Collapse (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Expanded Body Content */}
            <div className="pt-1">{renderExpandedContent()}</div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center transition-opacity duration-150">
            {renderCollapsedContent()}
          </div>
        )}
      </div>
    </div>
  );
};
