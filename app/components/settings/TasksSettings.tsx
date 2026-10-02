import React, { useEffect, useState } from 'react';
import {
  Clock,
  Play,
  Square,
  Plus,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Calendar,
} from 'lucide-react';

interface QueuedTask {
  id: string;
  projectId: string;
  title: string;
  command: string;
  capabilities: string[];
  state: 'pending' | 'running' | 'approval_required' | 'failed' | 'cancelled' | 'completed';
  schedule: {
    type: 'one-time' | 'recurring';
    executeAt: number;
    cronIntervalMs?: number;
    timezone: string;
  };
  requiresApproval: boolean;
  approved: boolean;
  createdAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
  lastError?: string;
  lastResult?: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timestamp: number;
  };
}

export function TasksSettings() {
  const [tasks, setTasks] = useState<QueuedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [command, setCommand] = useState('');
  const [scheduleType, setScheduleType] = useState<'one-time' | 'recurring'>('recurring');
  const [intervalMinutes, setIntervalMinutes] = useState('60');

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/local/tasks');
      const data = await res.json();
      if (res.ok) {
        setTasks(data.tasks || []);
      } else {
        setMessage(data.error || 'Failed to load scheduled tasks');
      }
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTasks();
    const interval = setInterval(fetchTasks, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !command.trim()) {
      setMessage('Title and command are required.');
      return;
    }
    const cronIntervalMs = scheduleType === 'recurring' ? Math.max(1, parseInt(intervalMinutes, 10)) * 60 * 1000 : undefined;
    try {
      const res = await fetch('/api/local/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          projectId: 'default-project',
          title: title.trim(),
          command: command.trim(),
          schedule: {
            type: scheduleType,
            executeAt: Date.now(),
            cronIntervalMs,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create task');
      setTitle('');
      setCommand('');
      setMessage('Task created successfully');
      await fetchTasks();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      const res = await fetch('/api/local/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', taskId }),
      });
      if (res.ok) {
        await fetchTasks();
      }
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleExecute = async (taskId: string) => {
    try {
      const res = await fetch('/api/local/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', taskId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Execution failed');
      await fetchTasks();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleApprove = async (taskId: string) => {
    try {
      const res = await fetch('/api/local/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', taskId, approved: true }),
      });
      if (res.ok) {
        await fetchTasks();
      }
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const formatSchedule = (task: QueuedTask) => {
    if (task.schedule.type === 'one-time') {
      return `One-time (at ${new Date(task.schedule.executeAt).toLocaleTimeString()})`;
    }
    const mins = Math.round((task.schedule.cronIntervalMs || 3600000) / 60000);
    if (mins < 60) return `Every ${mins} minutes`;
    const hrs = Math.round(mins / 60);
    return `Every ${hrs} hour${hrs > 1 ? 's' : ''}`;
  };

  return (
    <div className="space-y-5 text-slate-200">
      <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-slate-950 to-emerald-500/10 p-5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-semibold text-violet-200">
            <Clock size={18} /> Scheduled &amp; Background Tasks
          </p>
          <button
            onClick={() => void fetchTasks()}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Automated background cron jobs and one-time tasks. Tasks execute with project directory isolation and process timeouts. Cancelling a running task terminates the active OS process immediately.
        </p>
      </div>

      {/* Create Task Form */}
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
        <input
          aria-label="Task title"
          placeholder="Task title (e.g. Build Diagnostics)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-500"
        />

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="schedType"
              checked={scheduleType === 'recurring'}
              onChange={() => setScheduleType('recurring')}
            />
            <span>Recurring</span>
          </label>
          <label className="text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer ml-3">
            <input
              type="radio"
              name="schedType"
              checked={scheduleType === 'one-time'}
              onChange={() => setScheduleType('one-time')}
            />
            <span>One-Time</span>
          </label>

          {scheduleType === 'recurring' && (
            <select
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(e.target.value)}
              className="ml-auto rounded-xl border border-white/10 bg-slate-950 px-2.5 py-1 text-xs text-slate-300"
            >
              <option value="15">Every 15 min</option>
              <option value="30">Every 30 min</option>
              <option value="60">Every 1 hour</option>
              <option value="360">Every 6 hours</option>
              <option value="1440">Every 24 hours</option>
            </select>
          )}
        </div>

        <input
          aria-label="Shell Command"
          placeholder="Shell command (e.g. npm test or cargo check)"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-500 sm:col-span-2 font-mono text-xs"
        />

        <button
          disabled={!title.trim() || !command.trim()}
          onClick={handleCreate}
          className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2 transition-colors cursor-pointer"
        >
          <Plus size={15} /> Add Scheduled Task
        </button>
      </div>

      {message && <p role="status" className="text-xs text-cyan-300 font-mono">{message}</p>}

      {/* Task List */}
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center text-xs text-slate-500">
            No scheduled tasks configured. Add a task above to schedule automatic background jobs.
          </div>
        ) : (
          tasks.map((task) => {
            const isRunning = task.state === 'running';
            const isCancelled = task.state === 'cancelled';
            const isCompleted = task.state === 'completed';
            const isPending = task.state === 'pending';
            const isApproval = task.state === 'approval_required';

            return (
              <div key={task.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{task.title}</p>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase border ${
                          isRunning
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse'
                            : isApproval
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : isCancelled
                            ? 'bg-slate-500/20 text-slate-400 border-slate-500/40'
                            : isCompleted
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                        }`}
                      >
                        {task.state.replace('_', ' ')}
                      </span>
                    </div>

                    <p className="mt-1 font-mono text-xs text-cyan-300/80 bg-black/40 px-2 py-1 rounded-lg border border-white/5 inline-block">
                      {task.command}
                    </p>

                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} /> {formatSchedule(task)}
                      </span>
                      {task.lastRunAt && (
                        <span>Last run: {new Date(task.lastRunAt).toLocaleTimeString()}</span>
                      )}
                      <span>Runs: {task.runCount}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isApproval && (
                      <button
                        onClick={() => void handleApprove(task.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs transition-colors"
                      >
                        <ShieldCheck size={13} /> Approve
                      </button>
                    )}

                    {!isRunning && !isCancelled && (
                      <button
                        onClick={() => void handleExecute(task.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs transition-colors"
                        title="Execute now"
                      >
                        <Play size={12} /> Run
                      </button>
                    )}

                    {(isRunning || isPending) && (
                      <button
                        onClick={() => void handleCancel(task.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs transition-colors"
                        title="Cancel task execution"
                      >
                        <Square size={11} className="fill-rose-300" /> Cancel
                      </button>
                    )}
                  </div>
                </div>

                {task.lastResult && (
                  <div className="rounded-xl bg-black/50 border border-white/5 p-2 text-xs font-mono">
                    <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-white/5">
                      <span>Exit code: {task.lastResult.exitCode ?? 'N/A'}</span>
                      <span>{new Date(task.lastResult.timestamp).toLocaleTimeString()}</span>
                    </div>
                    {task.lastResult.stdout && (
                      <pre className="mt-1 text-slate-300 whitespace-pre-wrap max-h-24 overflow-y-auto modern-scrollbar">
                        {task.lastResult.stdout.slice(0, 1000)}
                      </pre>
                    )}
                    {task.lastResult.stderr && (
                      <pre className="mt-1 text-rose-400 whitespace-pre-wrap max-h-24 overflow-y-auto modern-scrollbar">
                        {task.lastResult.stderr.slice(0, 1000)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
