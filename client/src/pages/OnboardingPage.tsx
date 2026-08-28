import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Github, FolderGit2, CheckSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const OnboardingPage: React.FC = () => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [projectName, setProjectName] = useState('');
  const [projectRepo, setProjectRepo] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const { token, updateUser } = useAuth();
  const navigate = useNavigate();

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    setStep(3);
  };

  const handleConnectGitHub = async () => {
    setLoading(true);
    try {
      if (token) {
        await fetch('/api/github/connect-demo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ username: 'developer-swaply' })
        });
        updateUser({ github_connected: 1, github_username: 'developer-swaply' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setStep(4);
    }
  };

  const handleFinishOnboarding = async () => {
    setLoading(true);
    try {
      if (token) {
        // Fetch workspaces
        const resWs = await fetch('/api/workspaces', { headers: { Authorization: `Bearer ${token}` } });
        const dataWs = await resWs.json();
        const wsId = dataWs.workspaces?.[0]?.id;

        if (wsId) {
          // Create project
          const resProj = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              name: projectName || 'My Core Platform',
              workspaceId: wsId,
              githubRepoName: projectRepo || null
            })
          });
          const dataProj = await resProj.json();
          const projId = dataProj.project?.id;

          if (projId) {
            // Create first task
            await fetch('/api/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                projectId: projId,
                title: taskTitle || 'Setup core architecture and dependencies',
                status: 'TODO',
                priority: 'HIGH'
              })
            });
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-eink-bg text-eink-text flex items-center justify-center p-6 eink-paper font-sans select-none">
      <div className="w-full max-w-lg bg-eink-surface border border-eink-border p-8 rounded-sm shadow-2xl space-y-6 font-technical">
        {/* Top Branding */}
        <div className="text-center space-y-1 pb-4 border-b border-eink-border">
          <div className="w-8 h-8 bg-eink-text text-eink-bg flex items-center justify-center rounded-sm font-bold text-sm mx-auto mb-2">
            S
          </div>
          <h1 className="font-bold text-xl tracking-tight text-eink-text">SHIORI</h1>
          <p className="text-xs text-eink-textMuted uppercase">PLAN. BUILD. VERIFY.</p>
        </div>

        {/* STEP 1: Welcome */}
        {step === 1 && (
          <div className="text-center space-y-5 py-4">
            <div className="space-y-2">
              <h2 className="text-base font-bold text-eink-text uppercase">
                Welcome to your development workspace
              </h2>
              <p className="text-xs text-eink-textSecondary leading-relaxed font-sans max-w-sm mx-auto">
                Connect your engineering tasks with the commits, pull requests, and CI verification you actually ship.
              </p>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-3 bg-eink-text text-eink-bg text-xs font-bold rounded-sm flex items-center justify-center gap-2 shadow-eink-sm"
            >
              <span>GET STARTED (2 MIN SETUP)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: First Project */}
        {step === 2 && (
          <form onSubmit={handleCreateProject} className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] text-eink-textMuted uppercase font-bold">STEP 1 OF 3</span>
              <h2 className="text-sm font-bold text-eink-text uppercase">CREATE YOUR FIRST PROJECT</h2>
              <p className="text-eink-textSecondary font-sans">
                Group tasks by codebase, subsystem or service.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-[10px] text-eink-textMuted uppercase mb-1">Project Name *</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. SwaplyOne Compiler"
                  className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] text-eink-textMuted uppercase mb-1">GitHub Repo Name (Optional)</label>
                <input
                  type="text"
                  value={projectRepo}
                  onChange={(e) => setProjectRepo(e.target.value)}
                  placeholder="e.g. swaply-one-compiler"
                  className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-technical text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm flex items-center justify-center gap-1.5 shadow-eink-sm"
            >
              <span>CONTINUE</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* STEP 3: Connect GitHub */}
        {step === 3 && (
          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] text-eink-textMuted uppercase font-bold">STEP 2 OF 3</span>
              <h2 className="text-sm font-bold text-eink-text uppercase">CONNECT GITHUB (OPTIONAL)</h2>
              <p className="text-eink-textSecondary font-sans">
                Link development activity, branches, and automated CI test checks to your tasks.
              </p>
            </div>

            <div className="p-4 bg-eink-bg border border-eink-border rounded-sm space-y-2">
              <div className="flex items-center gap-2">
                <Github className="w-5 h-5 text-eink-text" />
                <span className="font-bold text-eink-text">GitHub Account</span>
              </div>
              <p className="text-[11px] text-eink-textSecondary font-sans">
                Connect your account to auto-verify pull requests and track workflow runs.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="flex-1 py-2.5 border border-eink-border hover:bg-eink-bg text-eink-text font-bold rounded-sm"
              >
                SKIP FOR NOW
              </button>
              <button
                type="button"
                onClick={handleConnectGitHub}
                disabled={loading}
                className="flex-1 py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm"
              >
                {loading ? 'CONNECTING...' : 'CONNECT GITHUB'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: First Task */}
        {step === 4 && (
          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] text-eink-textMuted uppercase font-bold">STEP 3 OF 3</span>
              <h2 className="text-sm font-bold text-eink-text uppercase">YOU'RE READY. CREATE YOUR FIRST TASK</h2>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] text-eink-textMuted uppercase mb-1">First Task Title</label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g. Implement authentication middleware"
                className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans text-xs"
              />
            </div>

            <button
              onClick={handleFinishOnboarding}
              disabled={loading}
              className="w-full py-3 bg-eink-text text-eink-bg font-bold rounded-sm flex items-center justify-center gap-2 shadow-eink-sm"
            >
              <span>{loading ? 'INITIALIZING...' : 'ENTER SHIORI WORKSPACE'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
