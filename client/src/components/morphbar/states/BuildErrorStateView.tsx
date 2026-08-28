import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, XCircle, ArrowUpRight, CheckCircle2 } from 'lucide-react';

export const BuildErrorCollapsedView: React.FC<{ data?: any }> = ({ data }) => {
  return (
    <div className="flex items-center justify-between w-full px-3 py-1 text-xs font-technical text-eink-text select-none">
      <div className="flex items-center gap-2">
        <span className="font-bold text-xs">! BUILD FAILED</span>
        <span className="text-[11px] text-eink-textSecondary">
          {data?.errorsCount || 3} ERRORS
        </span>
      </div>
      <span className="text-[10px] bg-eink-darkSurface text-eink-darkText px-1.5 py-0.2 rounded font-bold font-mono">
        ✕ CI
      </span>
    </div>
  );
};

export const BuildErrorExpandedView: React.FC<{ data?: any; onClose: () => void }> = ({ data, onClose }) => {
  const navigate = useNavigate();
  const errorsList: string[] = data?.errors || [
    'Undefined reference in AST expression parser',
    'Macro bracket mismatch in tests/parser_nested_test.rs',
    'CI process exited with code 1',
  ];

  return (
    <div className="space-y-4 font-technical text-xs">
      <div className="p-3 bg-eink-surface border-2 border-eink-text rounded-sm space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs uppercase text-eink-text">
            {data?.projectName || 'swaply-one-compiler'}
          </span>
          <span className="bg-eink-bg border border-eink-border px-1.5 py-0.2 rounded text-[10px] font-mono">
            {data?.branchName || 'feature/error-page'}
          </span>
        </div>
        <p className="text-[11px] text-eink-textSecondary">
          Automated test suite failed with {errorsList.length} critical errors.
        </p>
      </div>

      <div className="space-y-1.5">
        <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-wider block">
          ERROR SUMMARY
        </span>
        <div className="p-3 bg-eink-bg border border-eink-border rounded-sm space-y-1.5 font-mono text-[11px]">
          {errorsList.map((err, idx) => (
            <div key={idx} className="flex items-start gap-2 text-eink-text">
              <span className="font-bold shrink-0">✕</span>
              <span>{err}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={() => {
            navigate('/github');
            onClose();
          }}
          className="px-3 py-1.5 border border-eink-border text-xs rounded-sm hover:bg-eink-surface"
        >
          VIEW LOGS
        </button>
        <button
          onClick={() => {
            navigate('/tasks');
            onClose();
          }}
          className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold text-xs rounded-sm shadow-eink-sm flex items-center gap-1.5"
        >
          <span>INSPECT TASK ({data?.taskCode || 'TASK-042'})</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const BuildSuccessCollapsedView: React.FC<{ data?: any }> = ({ data }) => {
  return (
    <div className="flex items-center justify-between w-full px-3 py-1 text-xs font-technical text-eink-text select-none animate-fade-in">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-3.5 h-3.5 text-eink-text" />
        <span className="font-bold text-xs uppercase tracking-wider">
          {data?.message || '✓ BUILD RECOVERED'}
        </span>
      </div>
      <span className="text-[10px] bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-bold font-mono">
        {data?.branchName || 'main'}
      </span>
    </div>
  );
};
