import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Search, Check, X, Shield, GitCommit, GitPullRequest, CheckSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FriendProgress } from '../types';
import { ConnectionsGridSkeleton } from '../components/ui/Skeleton';

export const FriendsPage: React.FC = () => {
  const { token } = useAuth();
  const [friends, setFriends] = useState<FriendProgress[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchFriends = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
        setPendingRequests(data.pendingRequests || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFriends();
  }, [token]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !token) return;

    try {
      setIsSearching(true);
      const res = await fetch(`/api/friends/search?query=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.users || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async (targetUserId: string) => {
    if (!token) return;
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId })
      });
      if (res.ok) {
        alert('Friend request sent.');
        setSearchResults((prev) => prev.filter((u) => u.id !== targetUserId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    if (!token) return;
    try {
      const res = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ requestId })
      });
      if (res.ok) {
        fetchFriends();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 select-none font-sans">
      {/* Header */}
      <div className="border-b border-eink-border pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-technical text-xl font-bold tracking-tight text-eink-text uppercase">
            FRIENDS & ACCOUNTABILITY
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            Mutual developer progress and development tracking
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2 font-technical text-xs">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search username to connect..."
            className="px-3 py-1.5 bg-eink-surface border border-eink-border rounded-sm outline-none text-eink-text w-56"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm"
          >
            SEARCH
          </button>
        </form>
      </div>

      {/* Pending Requests if any */}
      {pendingRequests.length > 0 && (
        <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-3 font-technical text-xs">
          <h3 className="font-bold text-eink-text uppercase">PENDING FRIEND REQUESTS ({pendingRequests.length})</h3>
          <div className="divide-y divide-eink-border/50">
            {pendingRequests.map((req) => (
              <div key={req.request_id} className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-bold text-eink-text">{req.name}</span>
                  <span className="text-eink-textMuted ml-2">@{req.username}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptRequest(req.request_id)}
                    className="px-2.5 py-1 bg-eink-text text-eink-bg rounded-sm font-bold flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>ACCEPT</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-3 font-technical text-xs">
          <h3 className="font-bold text-eink-text uppercase">SEARCH RESULTS</h3>
          <div className="divide-y divide-eink-border/50">
            {searchResults.map((u) => (
              <div key={u.id} className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-bold text-eink-text">{u.name}</span>
                  <span className="text-eink-textMuted ml-2">@{u.username}</span>
                </div>
                <button
                  onClick={() => handleSendRequest(u.id)}
                  className="px-2.5 py-1 border border-eink-border bg-eink-bg hover:bg-eink-surface rounded-sm font-bold flex items-center gap-1 text-eink-text"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>ADD FRIEND</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends Accountability Grid */}
      {loading ? (
        <ConnectionsGridSkeleton count={3} />
      ) : friends.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-eink-border rounded-sm space-y-3 bg-eink-surface/30 font-technical">
          <Users className="w-8 h-8 text-eink-textMuted mx-auto" />
          <h3 className="font-bold text-sm text-eink-text uppercase">NO FRIENDS CONNECTED</h3>
          <p className="text-xs text-eink-textSecondary max-w-sm mx-auto font-sans">
            Use the search bar above to look up teammates by username or SHIORI ID.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
        {friends.map((friend) => (
          <div
            key={friend.id}
            className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-card font-technical"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-eink-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-sm bg-eink-darkSurface text-eink-darkText flex items-center justify-center font-bold text-xs">
                  {friend.name[0]}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-eink-text uppercase tracking-tight">
                    {friend.name}
                  </h3>
                  <p className="text-[11px] text-eink-textMuted -mt-0.5">@{friend.username}</p>
                </div>
              </div>
              <span className="text-[10px] text-eink-textMuted uppercase">
                ACTIVE
              </span>
            </div>

            {/* Today's Tasks */}
            <div className="space-y-1 text-xs">
              <span className="text-[10px] text-eink-textMuted uppercase block font-bold">TODAY</span>
              <div className="flex items-baseline justify-between">
                <span className="text-eink-textSecondary">Tasks completed:</span>
                <span className="font-bold text-eink-text">
                  {String(friend.stats.completedTasks).padStart(2, '0')} / {String(friend.stats.totalTasks).padStart(2, '0')}
                </span>
              </div>
              <div className="w-full bg-eink-bg h-1.5 border border-eink-border rounded overflow-hidden mt-1">
                <div
                  className="bg-eink-text h-full"
                  style={{
                    width: `${Math.round((friend.stats.completedTasks / (friend.stats.totalTasks || 1)) * 100)}%`
                  }}
                />
              </div>
            </div>

            {/* GitHub Stats */}
            <div className="p-3 bg-eink-bg border border-eink-border rounded-sm space-y-1.5 text-xs">
              <span className="text-[10px] text-eink-textMuted uppercase block font-bold">GITHUB</span>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-eink-textSecondary">
                  <GitCommit className="w-3.5 h-3.5" />
                  <span>{String(friend.stats.commitsToday).padStart(2, '0')} commits</span>
                </div>
                <div className="flex items-center gap-1 text-eink-textSecondary">
                  <GitPullRequest className="w-3.5 h-3.5" />
                  <span>{String(friend.stats.prsToday).padStart(2, '0')} PR</span>
                </div>
              </div>
            </div>

            {/* Current Active Task */}
            <div className="space-y-1 text-xs">
              <span className="text-[10px] text-eink-textMuted uppercase block font-bold">CURRENT TASK</span>
              <div className="flex items-center justify-between p-2 bg-eink-bg border border-eink-border rounded-sm">
                <div className="truncate pr-2">
                  <p className="font-bold text-eink-text truncate text-xs">
                    {friend.stats.activeTaskTitle}
                  </p>
                  <p className="text-[10px] text-eink-textMuted">{friend.stats.activeTaskCode}</p>
                </div>
                <span className="px-1.5 py-0.2 text-[10px] border border-eink-border rounded bg-eink-surface">
                  {friend.stats.activeTaskCiStatus}
                </span>
              </div>
            </div>

            {/* Last Activity */}
            <div className="pt-2 border-t border-eink-border flex items-center justify-between text-[11px] text-eink-textMuted">
              <span>LAST ACTIVITY</span>
              <span className="font-bold text-eink-text">{friend.stats.lastActivity}</span>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
  );
};
