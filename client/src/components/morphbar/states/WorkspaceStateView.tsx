import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, X, ArrowRight } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useNotifications } from '../../../context/NotificationContext';

export const WorkspaceCollapsedView: React.FC<{ data?: any }> = ({ data }) => {
  return (
    <div className="flex items-center justify-between w-full px-3 py-1 text-xs font-technical text-eink-text select-none">
      <div className="flex items-center gap-2 truncate">
        <Building2 className="w-3.5 h-3.5 shrink-0" />
        <span className="font-bold uppercase text-[11px] shrink-0">WORKSPACE INVITE</span>
        <span className="text-eink-textSecondary truncate text-[11px]">
          {data?.workspaceName || 'SHIORI COMPILER'}
        </span>
      </div>
      <span className="text-[10px] bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-bold ml-2 shrink-0">
        INVITE
      </span>
    </div>
  );
};

export const WorkspaceExpandedView: React.FC<{ data?: any; onClose: () => void }> = ({ data, onClose }) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { triggerEInkRefresh } = useNotifications();

  const handleRespond = async (action: 'ACCEPT' | 'DECLINE') => {
    if (!token || !data?.inviteId) {
      navigate('/workspaces');
      onClose();
      return;
    }

    try {
      await fetch(`/api/workspaces/invites/${data.inviteId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      triggerEInkRefresh();
      navigate('/workspaces');
      onClose();
    } catch (err) {
      console.error(err);
      navigate('/workspaces');
      onClose();
    }
  };

  return (
    <div className="space-y-4 font-technical text-xs">
      <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-2">
        <span className="text-[10px] text-eink-textMuted uppercase font-bold block">
          WORKSPACE INVITATION
        </span>
        <h4 className="font-bold text-base text-eink-text">
          {data?.workspaceName || 'SHIORI COMPILER'}
        </h4>
        <p className="text-[11px] text-eink-textSecondary font-sans leading-relaxed">
          <strong>{data?.inviterName || 'Lijith'}</strong> invited you to join this workspace. Two-sided OTP verification will be required before you are added as a member.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={() => handleRespond('DECLINE')}
          className="px-3 py-1.5 border border-eink-border hover:bg-eink-surface text-xs rounded-sm"
        >
          DECLINE
        </button>
        <button
          onClick={() => handleRespond('ACCEPT')}
          className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold text-xs rounded-sm shadow-eink-sm flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          <span>ACCEPT INVITATION</span>
        </button>
      </div>
    </div>
  );
};
