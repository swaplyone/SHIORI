import React from 'react';
import { Plus } from 'lucide-react';
import { Task, TaskStatus } from '../../types';
import { TaskCard } from './TaskCard';

interface KanbanBoardProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onAddTask: (status?: TaskStatus) => void;
  onUpdateStatus?: (taskId: string, newStatus: TaskStatus) => void;
}

const COLUMNS: { key: TaskStatus; label: string; symbol: string }[] = [
  { key: 'BACKLOG', label: 'BACKLOG', symbol: '·' },
  { key: 'TODO', label: 'TODO', symbol: '○' },
  { key: 'IN_PROGRESS', label: 'IN PROGRESS', symbol: '◐' },
  { key: 'REVIEW', label: 'REVIEW', symbol: '→' },
  { key: 'DONE', label: 'DONE', symbol: '✓' },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tasks,
  onSelectTask,
  onAddTask,
  onUpdateStatus,
}) => {
  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter((t) => t.status === status);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId && onUpdateStatus) {
      onUpdateStatus(taskId, status);
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-6 min-h-[70vh] font-sans">
      {COLUMNS.map((col) => {
        const colTasks = getTasksByStatus(col.key);
        return (
          <div
            key={col.key}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.key)}
            className="w-72 shrink-0 flex flex-col bg-eink-surface/40 border border-eink-border rounded-sm p-3 select-none"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-eink-border">
              <div className="flex items-center gap-2">
                <span className="font-technical font-bold text-xs text-eink-text">
                  {col.symbol} {col.label}
                </span>
                <span className="font-technical text-[10px] text-eink-textMuted bg-eink-surface px-1.5 py-0.2 border border-eink-border rounded">
                  {String(colTasks.length).padStart(2, '0')}
                </span>
              </div>
              <button
                onClick={() => onAddTask(col.key)}
                className="p-1 hover:bg-eink-surface border border-transparent hover:border-eink-border rounded text-eink-textSecondary hover:text-eink-text"
                title={`Add task to ${col.label}`}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Column Task List */}
            <div className="flex-1 space-y-3 overflow-y-auto min-h-[150px]">
              {colTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                >
                  <TaskCard task={task} onClick={() => onSelectTask(task)} />
                </div>
              ))}

              {colTasks.length === 0 && (
                <div className="h-28 border border-dashed border-eink-border/60 rounded flex items-center justify-center text-center p-3">
                  <p className="text-[11px] font-technical text-eink-textMuted">
                    No tasks in {col.label}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
