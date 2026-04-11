import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { PanelShell } from '../components/PanelShell';

/**
 * Game settings with localStorage persistence.
 */
export interface GameSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  particleDensity: 'low' | 'medium' | 'high';
  showDamageNumbers: boolean;
  showBuffTimers: boolean;
  minimapOpacity: number;
  zoomSensitivity: number;
  autoAttack: boolean;
  autoPickup: boolean;
  showFps: boolean;
  chatTimestamps: boolean;
  uiScale: number;
}

const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 80,
  sfxVolume: 70,
  musicVolume: 50,
  particleDensity: 'high',
  showDamageNumbers: true,
  showBuffTimers: true,
  minimapOpacity: 80,
  zoomSensitivity: 50,
  autoAttack: true,
  autoPickup: true,
  showFps: false,
  chatTimestamps: true,
  uiScale: 100,
};

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem('rf_settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: GameSettings): void {
  localStorage.setItem('rf_settings', JSON.stringify(s));
}

// Global access for other systems
let _currentSettings = loadSettings();
export function getSettings(): GameSettings { return _currentSettings; }

const KEYBINDS: [string, string][] = [
  ['W/A/S/D', 'Move'],
  ['I', 'Inventory'],
  ['E', 'Equipment'],
  ['B', 'Bank (near NPC)'],
  ['C', 'Crafting (near NPC)'],
  ['M', 'Marketplace (near NPC)'],
  ['P', 'Stat Points'],
  ['Q', 'Quest Log'],
  ['N', 'Character Stats'],
  ['O', 'Settings'],
  ['G', 'Social / Friends'],
  ['Y', 'Achievements'],
  ['L', 'Combat Log'],
  ['K', 'Leaderboard'],
  ['Tab', 'World Map'],
  ['1-6', 'Skills'],
  ['Mouse Wheel', 'Zoom In/Out'],
  ['ESC', 'Close All Panels'],
  ['Enter', 'Chat Focus'],
];

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const settings = useSignal<GameSettings>(loadSettings());
  const activeTab = useSignal<'gameplay' | 'audio' | 'display' | 'keybinds'>('gameplay');

  const update = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    const next = { ...settings.value, [key]: value };
    settings.value = next;
    _currentSettings = next;
    saveSettings(next);
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <PanelShell title="⚙️ Settings" onClose={onClose} width="w-[420px] max-w-[calc(100vw-2rem)]">
        {/* Tabs */}
        <div class="flex gap-1 mb-3 border-b border-rf-border/30 pb-2">
          {(['gameplay', 'audio', 'display', 'keybinds'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              class={`px-3 py-1 text-[11px] font-bold uppercase rounded transition-colors ${
                activeTab.value === tab
                  ? 'bg-rf-accent/20 text-rf-accent border border-rf-accent/30'
                  : 'text-rf-muted hover:text-rf-text border border-transparent'
              }`}
              onClick={() => { activeTab.value = tab; }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {activeTab.value === 'gameplay' && (
            <>
              <Toggle label="Auto Attack" value={settings.value.autoAttack} onChange={v => update('autoAttack', v)} desc="Automatically attack nearby enemies" />
              <Toggle label="Auto Pickup" value={settings.value.autoPickup} onChange={v => update('autoPickup', v)} desc="Pick up nearby items automatically" />
              <Toggle label="Show Damage Numbers" value={settings.value.showDamageNumbers} onChange={v => update('showDamageNumbers', v)} />
              <Toggle label="Show Buff Timers" value={settings.value.showBuffTimers} onChange={v => update('showBuffTimers', v)} />
              <Toggle label="Chat Timestamps" value={settings.value.chatTimestamps} onChange={v => update('chatTimestamps', v)} />
              <Slider label="Zoom Sensitivity" value={settings.value.zoomSensitivity} min={10} max={100} onChange={v => update('zoomSensitivity', v)} />
              <Select label="Particle Density" value={settings.value.particleDensity} options={['low', 'medium', 'high']} onChange={v => update('particleDensity', v as GameSettings['particleDensity'])} />
            </>
          )}

          {activeTab.value === 'audio' && (
            <>
              <Slider label="Master Volume" value={settings.value.masterVolume} min={0} max={100} onChange={v => update('masterVolume', v)} suffix="%" />
              <Slider label="SFX Volume" value={settings.value.sfxVolume} min={0} max={100} onChange={v => update('sfxVolume', v)} suffix="%" />
              <Slider label="Music Volume" value={settings.value.musicVolume} min={0} max={100} onChange={v => update('musicVolume', v)} suffix="%" />
              <div class="text-[10px] text-rf-muted italic mt-2">🔇 Audio system coming soon — settings will be applied when available.</div>
            </>
          )}

          {activeTab.value === 'display' && (
            <>
              <Slider label="UI Scale" value={settings.value.uiScale} min={75} max={150} onChange={v => update('uiScale', v)} suffix="%" />
              <Slider label="Minimap Opacity" value={settings.value.minimapOpacity} min={20} max={100} onChange={v => update('minimapOpacity', v)} suffix="%" />
              <Toggle label="Show FPS" value={settings.value.showFps} onChange={v => update('showFps', v)} />
            </>
          )}

          {activeTab.value === 'keybinds' && (
            <div class="space-y-1">
              {KEYBINDS.map(([key, action]) => (
                <div key={key} class="flex justify-between items-center py-1 border-b border-rf-border/10">
                  <span class="text-xs text-rf-text">{action}</span>
                  <span class="text-[10px] font-mono bg-rf-surface-inset px-2 py-0.5 rounded border border-rf-border/30 text-rf-accent">{key}</span>
                </div>
              ))}
              <div class="text-[10px] text-rf-muted italic mt-2">Custom keybindings coming in a future update.</div>
            </div>
          )}
        </div>

        {/* Reset button */}
        <div class="mt-3 pt-2 border-t border-rf-border/20 flex justify-end">
          <button
            type="button"
            class="px-3 py-1 text-[10px] text-rf-danger border border-rf-danger/30 rounded hover:bg-rf-danger/10 transition-colors"
            onClick={() => {
              settings.value = { ...DEFAULT_SETTINGS };
              _currentSettings = { ...DEFAULT_SETTINGS };
              saveSettings(DEFAULT_SETTINGS);
            }}
          >
            Reset to Defaults
          </button>
        </div>
      </PanelShell>
    </div>
  );
}

// --- Sub-components ---

function Toggle({ label, value, onChange, desc }: { label: string; value: boolean; onChange: (v: boolean) => void; desc?: string }) {
  return (
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xs text-rf-text">{label}</div>
        {desc && <div class="text-[9px] text-rf-muted">{desc}</div>}
      </div>
      <button
        type="button"
        class={`w-9 h-5 rounded-full transition-colors relative ${value ? 'bg-rf-accent' : 'bg-rf-surface-inset border border-rf-border/40'}`}
        onClick={() => onChange(!value)}
      >
        <div class={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function Slider({ label, value, min, max, onChange, suffix }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div>
      <div class="flex justify-between mb-1">
        <span class="text-xs text-rf-text">{label}</span>
        <span class="text-[10px] text-rf-accent font-mono">{value}{suffix ?? ''}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onInput={(e) => onChange(parseInt((e.target as HTMLInputElement).value, 10))}
        class="w-full h-1.5 bg-rf-surface-inset rounded-full appearance-none cursor-pointer accent-rf-accent"
      />
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div class="flex items-center justify-between">
      <span class="text-xs text-rf-text">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        class="bg-rf-surface-inset border border-rf-border/40 rounded px-2 py-0.5 text-[11px] text-rf-text appearance-none cursor-pointer"
      >
        {options.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
      </select>
    </div>
  );
}
