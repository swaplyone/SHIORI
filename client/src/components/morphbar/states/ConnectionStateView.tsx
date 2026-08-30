import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Check, X, ShieldCheck, ArrowRight } from 'lucide-react';
import { useNotifications } from '../../../context/NotificationContext';
import { useAuth } from '../../../context/AuthContext';

export const ConnectionCollapsedView: React.FC<{ data?: any }> = ({ data }) => {
  return (
    <div className="flex items-center justify-between w-full px-3 py-1 text-xs font-technical text-eink-text select-none">
      <div className="flex items-center gap-2 truncate">
        <Users className="w-3.5 h-3.5 shrink-0" />
        <span className="font-bold uppercase text-[11px] shrink-0">● CONNECTION REQ</span>
        <span className="text-eink-textSecondary truncate text-[11px]">
          {data?.senderName || 'Collaborator'}
        </span>
      </div>
      <span className="text-[10px] bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-bold ml-2 shrink-0">
        {data?.senderShioriId || 'SHI-USER'}
      </span>
    </div>
  );
};

export const ConnectionExpandedView: React.FC<{ data?: any; onClose: () => void }> = ({ data, onClose }) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { triggerEInkRefresh } = useNotifications();

  const handleRespond = async (action: 'ACCEPT' | 'DECLINE') => {
    if (!token || !data?.requestId) {
      navigate('/connections');
      onClose();
      return;
    }

    try {
      await fetch('/api/connections/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ requestId: data.requestId, action })
      });
      triggerEInkRefresh();
      navigate('/connections');
      onClose();
    } catch (err) {
      console.error(err);
      navigate('/connections');
      onClose();
    }
  };

  return (
    <div className="space-y-4 font-technical text-xs">
      <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-2">
        <span className="text-[10px] text-eink-textMuted uppercase font-bold block">
          INCOMING INTENTIONAL CONNECTION
        </span>
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-base text-eink-text">{data?.senderName || 'Collaborator'}</h4>
          <span className="bg-eink-bg border border-eink-border px-2 py-0.5 rounded text-xs font-bold">
            {data?.senderShioriId || 'SHI-USER'}
          </span>
        </div>
        <p className="text-[11px] text-eink-textSecondary font-sans leading-relaxed">
          wants to connect with you. Accepting will initiate a two-sided cryptographic verification handshake.
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
          <span>ACCEPT & VERIFY</span>
        </button>
      </div>
    </div>
  );
};
