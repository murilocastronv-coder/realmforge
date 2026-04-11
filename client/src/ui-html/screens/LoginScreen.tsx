import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { getAuthService, type AuthResult } from '../../services/AuthService';
import { InputGate } from '../../services/InputGate';

const CLASSES = [
  { key: 'warrior', icon: '⚔️', label: 'Warrior', desc: '+HP +ATK +DEF', color: 'text-red-400',    bg: 'from-red-900/20 to-red-950/10',    border: 'border-red-700/40',    stats: 'VIT 8 · STR 6 · FOR 5' },
  { key: 'mage',    icon: '🔮', label: 'Mage',    desc: '+MP +LCK +SPD', color: 'text-blue-400',   bg: 'from-blue-900/20 to-blue-950/10',   border: 'border-blue-700/40',   stats: 'END 8 · FOR 4 · AGI 5' },
  { key: 'ranger',  icon: '🏹', label: 'Ranger',  desc: '+HP +SPD +LCK', color: 'text-green-400',  bg: 'from-green-900/20 to-green-950/10',  border: 'border-green-700/40',  stats: 'VIT 5 · AGI 7 · LCK 6' },
  { key: 'rogue',   icon: '🗡️', label: 'Rogue',   desc: '+ATK +SPD +LCK', color: 'text-purple-400', bg: 'from-purple-900/20 to-purple-950/10', border: 'border-purple-700/40', stats: 'STR 6 · AGI 8 · LCK 5' },
];

/**
 * LoginScreen — immersive full-screen login with animated particle background.
 */
export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const selectedClass = useSignal('warrior');
  const status = useSignal('');
  const statusType = useSignal<'error' | 'pending' | 'success'>('error');
  const authInProgress = useSignal(false);
  const showRegister = useSignal(false);

  useEffect(() => {
    InputGate.claimFocus('login');
    InputGate.claimPointer('login');
    setTimeout(() => usernameRef.current?.focus(), 400);
    return () => {
      InputGate.releaseFocus('login');
      InputGate.releasePointer('login');
    };
  }, []);

  const doAuth = async (isRegister: boolean) => {
    if (authInProgress.value) return;
    const user = usernameRef.current?.value.trim() ?? '';
    const pass = passwordRef.current?.value.trim() ?? '';

    if (!user || !pass) {
      status.value = '⚠ Please enter username and password';
      statusType.value = 'error';
      return;
    }
    if (user.length < 3) {
      status.value = '⚠ Username must be at least 3 characters';
      statusType.value = 'error';
      return;
    }

    status.value = '⟳ Connecting to realm...';
    statusType.value = 'pending';
    authInProgress.value = true;

    const auth = getAuthService();
    const result: AuthResult = await auth.authenticate({
      username: user,
      password: pass,
      isRegister,
      playerClass: isRegister ? selectedClass.value : undefined,
    });

    if (result.success) {
      status.value = '✅ Success! Entering world...';
      statusType.value = 'success';
      setTimeout(onLogin, 500);
    } else {
      status.value = result.error || 'Authentication failed';
      statusType.value = 'error';
      authInProgress.value = false;
    }
  };

  const statusColor =
    statusType.value === 'success' ? 'text-emerald-400'
    : statusType.value === 'pending' ? 'text-sky-400'
    : 'text-red-400';

  const activeClass = CLASSES.find(c => c.key === selectedClass.value) ?? CLASSES[0];

  return (
    <div data-interactive class="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden select-none">
      {/* Dark animated background */}
      <div class="absolute inset-0 bg-gradient-to-b from-[#030810] via-[#0a1525] to-[#060a10]">
        <div class="stars-layer-1" />
        <div class="stars-layer-2" />
        <div class="stars-layer-3" />
        {/* Animated nebula glows */}
        <div class="absolute top-1/3 left-1/4 w-[500px] h-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/[0.03] blur-3xl animate-nebula1" />
        <div class="absolute top-2/3 left-3/4 w-[400px] h-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-500/[0.025] blur-3xl animate-nebula2" />
        <div class="absolute top-1/2 left-1/2 w-[600px] h-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/[0.015] blur-3xl animate-nebula3" />
        {/* Floating particles */}
        <div class="particle p1" /><div class="particle p2" /><div class="particle p3" />
        <div class="particle p4" /><div class="particle p5" /><div class="particle p6" />
      </div>

      {/* Title with glow */}
      <div class="relative z-10 text-center mb-8 animate-float">
        <div class="relative inline-block">
          <h1 class="text-[52px] font-black font-mono tracking-[0.12em] text-transparent bg-clip-text bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 drop-shadow-[0_0_20px_rgba(240,195,91,0.3)]">
            REALMFORGE
          </h1>
          <div class="absolute inset-0 text-[52px] font-black font-mono tracking-[0.12em] text-amber-400/10 blur-lg" aria-hidden>
            REALMFORGE
          </div>
        </div>
        <p class="text-[14px] font-mono text-slate-400 tracking-[0.2em] mt-1 uppercase">
          Forge Your Destiny
        </p>
        <div class="flex items-center justify-center gap-3 mt-3">
          <div class="w-16 h-px bg-gradient-to-r from-transparent to-amber-500/40" />
          <span class="text-amber-500/60 text-[10px]">✦ ✦ ✦</span>
          <div class="w-16 h-px bg-gradient-to-l from-transparent to-amber-500/40" />
        </div>
      </div>

      {/* Main card */}
      <div class="relative z-10 w-[420px] max-w-[calc(100vw-2rem)] animate-panel-in">
        <div class="rounded-xl border border-slate-700/60 bg-slate-900/90 shadow-2xl shadow-black/60 backdrop-blur-md overflow-hidden">
          {/* Decorative top bar */}
          <div class="h-1 bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />

          <div class="px-7 pt-5 pb-6">
            {/* Form header */}
            <div class="text-center mb-4">
              <span class="text-[13px] font-bold font-mono text-amber-400/80 tracking-[0.15em] uppercase">
                {showRegister.value ? '✦ New Hero ✦' : '⚔ Enter Realm ⚔'}
              </span>
            </div>

            <div class="space-y-3">
              {/* Username */}
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[13px]">👤</span>
                <input
                  ref={usernameRef}
                  type="text"
                  placeholder="Username"
                  autoComplete="username"
                  class="w-full pl-9 pr-3.5 py-2.5 bg-slate-800/70 text-[14px] text-slate-100 border border-slate-600/50 rounded-lg outline-none
                         font-sans placeholder:text-slate-500/60 transition-all
                         focus:border-amber-500/50 focus:shadow-[0_0_0_2px_rgba(245,158,11,0.1),0_0_15px_rgba(245,158,11,0.05)]
                         hover:border-slate-500/70"
                  onKeyDown={(e) => { if (e.key === 'Enter') passwordRef.current?.focus(); }}
                />
              </div>

              {/* Password */}
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[13px]">🔑</span>
                <input
                  ref={passwordRef}
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  class="w-full pl-9 pr-3.5 py-2.5 bg-slate-800/70 text-[14px] text-slate-100 border border-slate-600/50 rounded-lg outline-none
                         font-sans placeholder:text-slate-500/60 transition-all
                         focus:border-amber-500/50 focus:shadow-[0_0_0_2px_rgba(245,158,11,0.1),0_0_15px_rgba(245,158,11,0.05)]
                         hover:border-slate-500/70"
                  onKeyDown={(e) => { if (e.key === 'Enter') doAuth(showRegister.value); }}
                />
              </div>

              {/* Class selection (only on register) */}
              {showRegister.value && (
                <div class="animate-panel-in">
                  <label class="block text-[11px] font-bold font-mono text-amber-400/70 mb-2 tracking-wider">CHOOSE YOUR CLASS</label>
                  <div class="grid grid-cols-2 gap-2">
                    {CLASSES.map((cls) => {
                      const isSelected = selectedClass.value === cls.key;
                      return (
                        <button
                          key={cls.key}
                          class={`relative flex flex-col items-center py-2.5 px-2 rounded-lg border transition-all duration-200 ${
                            isSelected
                              ? `bg-gradient-to-b ${cls.bg} ${cls.border} shadow-lg`
                              : 'bg-slate-800/40 border-slate-700/40 hover:border-slate-600/60 hover:bg-slate-800/60'
                          }`}
                          onClick={() => { selectedClass.value = cls.key; }}
                        >
                          <span class="text-[22px] mb-0.5">{cls.icon}</span>
                          <span class={`text-[12px] font-bold font-mono ${isSelected ? cls.color : 'text-slate-400'}`}>
                            {cls.label}
                          </span>
                          <span class="text-[9px] font-mono text-slate-500 mt-0.5">{cls.stats}</span>
                          {isSelected && (
                            <div class={`absolute -top-px left-0 right-0 h-0.5 rounded-t bg-gradient-to-r from-transparent ${cls.border.replace('border-', 'via-').replace('/40', '/60')} to-transparent`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* Active class flavor text */}
                  <div class="mt-2 text-center">
                    <span class={`text-[10px] font-mono ${activeClass.color}`}>{activeClass.desc}</span>
                  </div>
                </div>
              )}

              {/* Status */}
              {status.value && (
                <div class={`text-[12px] font-mono text-center py-1 ${statusColor} animate-panel-in`}>
                  {status.value}
                </div>
              )}

              {/* Action buttons */}
              <div class="pt-1 space-y-2">
                <button
                  class="w-full py-2.5 text-[13px] font-bold font-mono rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed
                         bg-gradient-to-r from-amber-600 to-amber-700 text-white border border-amber-500/30
                         hover:from-amber-500 hover:to-amber-600 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)]
                         active:scale-[0.98]"
                  onClick={() => doAuth(showRegister.value)}
                  disabled={authInProgress.value}
                >
                  {showRegister.value ? '✦  CREATE HERO' : '▶  ENTER REALM'}
                </button>

                <button
                  class="w-full py-1.5 text-[11px] font-mono text-slate-400 hover:text-amber-400 transition-colors"
                  onClick={() => {
                    showRegister.value = !showRegister.value;
                    status.value = '';
                  }}
                >
                  {showRegister.value ? '← Back to Login' : "Don't have an account? Register →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Version footer */}
      <p class="relative z-10 mt-8 text-[10px] font-mono text-slate-600">
        RealmForge v0.3.0 — Open Source MMORPG Engine
      </p>

      {/* Animations */}
      <style>{`
        @keyframes nebula1 {
          0%, 100% { transform: translate(-50%,-50%) scale(1); opacity: 0.03; }
          50%      { transform: translate(-50%,-50%) scale(1.2,1.1); opacity: 0.06; }
        }
        @keyframes nebula2 {
          0%, 100% { transform: translate(-50%,-50%) scale(1); opacity: 0.025; }
          50%      { transform: translate(-50%,-50%) scale(1.15,1.2); opacity: 0.05; }
        }
        @keyframes nebula3 {
          0%, 100% { transform: translate(-50%,-50%) scale(1); opacity: 0.015; }
          50%      { transform: translate(-50%,-50%) scale(1.1,1.05); opacity: 0.03; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        @keyframes particle-drift {
          0%   { transform: translateY(100vh) scale(0); opacity: 0; }
          10%  { opacity: 1; transform: translateY(80vh) scale(1); }
          90%  { opacity: 0.5; }
          100% { transform: translateY(-10vh) scale(0.5); opacity: 0; }
        }
        .animate-nebula1 { animation: nebula1 6s ease-in-out infinite; }
        .animate-nebula2 { animation: nebula2 8s ease-in-out infinite 2s; }
        .animate-nebula3 { animation: nebula3 10s ease-in-out infinite 4s; }
        .animate-float   { animation: float 3s ease-in-out infinite; }
        .particle {
          position: absolute;
          width: 2px; height: 2px;
          border-radius: 50%;
          animation: particle-drift linear infinite;
        }
        .p1 { left: 10%; background: rgba(245,158,11,0.4); animation-duration: 12s; animation-delay: 0s; }
        .p2 { left: 30%; background: rgba(56,189,248,0.3); animation-duration: 16s; animation-delay: 3s; }
        .p3 { left: 50%; background: rgba(168,85,247,0.3); animation-duration: 14s; animation-delay: 6s; }
        .p4 { left: 70%; background: rgba(245,158,11,0.3); animation-duration: 18s; animation-delay: 2s; }
        .p5 { left: 85%; background: rgba(56,189,248,0.4); animation-duration: 13s; animation-delay: 8s; }
        .p6 { left: 20%; background: rgba(168,85,247,0.3); animation-duration: 15s; animation-delay: 4s; }
        .stars-layer-1, .stars-layer-2, .stars-layer-3 {
          position: absolute; inset: 0;
          background-image: radial-gradient(1px 1px at var(--x1) var(--y1), rgba(255,255,255,0.25) 0%, transparent 100%),
                            radial-gradient(1px 1px at var(--x2) var(--y2), rgba(115,182,255,0.2) 0%, transparent 100%),
                            radial-gradient(1px 1px at var(--x3) var(--y3), rgba(191,141,255,0.18) 0%, transparent 100%),
                            radial-gradient(1px 1px at var(--x4) var(--y4), rgba(240,195,91,0.15) 0%, transparent 100%);
          animation: twinkle 3s ease-in-out infinite alternate;
        }
        .stars-layer-1 { --x1:15%;--y1:20%;--x2:45%;--y2:35%;--x3:75%;--y3:15%;--x4:90%;--y4:60%; }
        .stars-layer-2 { --x1:25%;--y1:70%;--x2:55%;--y2:85%;--x3:10%;--y3:50%;--x4:80%;--y4:40%; animation-delay:1s; }
        .stars-layer-3 { --x1:35%;--y1:10%;--x2:65%;--y2:55%;--x3:85%;--y3:80%;--x4:20%;--y4:90%; animation-delay:2s; }
        @keyframes twinkle { 0%{opacity:0.3} 100%{opacity:1} }
      `}</style>
    </div>
  );
}
