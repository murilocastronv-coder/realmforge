import { useComputed, useSignal } from '@preact/signals';
import { PanelShell } from '../components/PanelShell';
import {
  openPanels,
  togglePanel,
  guildData,
  guildInvite,
  gold,
  getNetwork,
  addChatMessage,
  type GuildMember,
} from '../../store/GameStore';
import { MessageType } from '../../network/WebSocketClient';
import { InputGate } from '../../services/InputGate';

function sendGuildAction(action: string, extra: Record<string, unknown> = {}) {
  try {
    getNetwork().send(MessageType.GuildAction, { action, ...extra });
  } catch {
    addChatMessage('system', 'System', 'Not connected to server.');
  }
}

export function GuildPanel() {
  const isOpen = useComputed(() => openPanels.value.has('guild'));
  const guild = useComputed(() => guildData.value);
  const invite = useComputed(() => guildInvite.value);
  const activeTab = useSignal<'info' | 'members' | 'chat'>('info');

  // Create guild form state
  const guildName = useSignal('');
  const guildTag = useSignal('');
  const inviteTarget = useSignal('');
  const depositAmount = useSignal('');
  const motdInput = useSignal('');
  const chatInput = useSignal('');
  const guildChatMessages = useSignal<Array<{ sender: string; text: string }>>([]);

  if (!isOpen.value) return null;

  const handleCreate = () => {
    if (guildName.value.length < 3 || guildName.value.length > 24) {
      addChatMessage('system', 'System', 'Guild name must be 3-24 characters.');
      return;
    }
    if (guildTag.value.length < 2 || guildTag.value.length > 4) {
      addChatMessage('system', 'System', 'Guild tag must be 2-4 characters.');
      return;
    }
    sendGuildAction('create', { name: guildName.value, tag: guildTag.value });
    guildName.value = '';
    guildTag.value = '';
  };

  const handleInvite = () => {
    if (!inviteTarget.value.trim()) return;
    sendGuildAction('invite', { target: inviteTarget.value.trim() });
    inviteTarget.value = '';
  };

  const handleDeposit = () => {
    const amount = parseInt(depositAmount.value, 10);
    if (!amount || amount <= 0) return;
    sendGuildAction('deposit_gold', { amount });
    depositAmount.value = '';
  };

  const handleSetMotd = () => {
    sendGuildAction('set_motd', { motd: motdInput.value });
    motdInput.value = '';
  };

  const handleChat = () => {
    if (!chatInput.value.trim()) return;
    sendGuildAction('chat', { text: chatInput.value.trim() });
    chatInput.value = '';
  };

  const rankIcon = (rank: string) => {
    if (rank === 'leader') return '👑';
    if (rank === 'officer') return '⭐';
    return '';
  };

  const currentGuild = guild.value;

  // No guild — show create form or pending invite
  if (!currentGuild) {
    return (
      <div class="fixed top-20 left-4 z-50">
        <PanelShell title="🏰 Guild" onClose={() => togglePanel('guild')} width="w-[340px] max-w-[calc(100vw-2rem)]">
          {invite.value && (
            <div class="bg-rf-accent/10 border border-rf-accent/30 rounded p-2 mb-3">
              <div class="text-xs text-rf-accent font-bold mb-1">🏰 Guild Invite</div>
              <div class="text-[10px] text-rf-text mb-2">
                {invite.value.fromPlayer} invited you to join <span class="text-rf-accent font-bold">{invite.value.guildName}</span>
              </div>
              <div class="flex gap-1">
                <button
                  type="button"
                  class="px-3 py-1 text-[10px] font-bold bg-rf-success/20 text-rf-success rounded hover:bg-rf-success/30"
                  onClick={() => { sendGuildAction('accept_invite'); guildInvite.value = null; }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  class="px-3 py-1 text-[10px] font-bold bg-rf-danger/20 text-rf-danger rounded hover:bg-rf-danger/30"
                  onClick={() => { guildInvite.value = null; }}
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          <div class="text-center py-4">
            <div class="text-3xl mb-2">🏰</div>
            <div class="text-xs text-rf-muted mb-4">You are not in a guild.</div>
          </div>

          <div class="space-y-2 px-1">
            <div class="text-[9px] text-rf-muted uppercase font-bold tracking-wider">Create a Guild (500 gold)</div>
            <input
              type="text"
              class="w-full bg-rf-surface-inset border border-rf-border/30 rounded px-2 py-1 text-xs text-rf-text placeholder:text-rf-muted/50 outline-none focus:border-rf-accent/50"
              placeholder="Guild Name (3-24 chars)"
              value={guildName.value}
              onInput={(e) => { guildName.value = (e.target as HTMLInputElement).value; }}
              onFocus={() => InputGate.claimKeyboard('guild-create-name')}
              onBlur={() => InputGate.releaseKeyboard('guild-create-name')}
              maxLength={24}
            />
            <input
              type="text"
              class="w-full bg-rf-surface-inset border border-rf-border/30 rounded px-2 py-1 text-xs text-rf-text placeholder:text-rf-muted/50 outline-none focus:border-rf-accent/50"
              placeholder="Tag (2-4 chars, e.g. RF)"
              value={guildTag.value}
              onInput={(e) => { guildTag.value = (e.target as HTMLInputElement).value; }}
              onFocus={() => InputGate.claimKeyboard('guild-create-tag')}
              onBlur={() => InputGate.releaseKeyboard('guild-create-tag')}
              maxLength={4}
            />
            <button
              type="button"
              class="w-full py-1.5 text-[10px] font-bold uppercase bg-rf-accent/20 text-rf-accent rounded hover:bg-rf-accent/30 disabled:opacity-40"
              onClick={handleCreate}
              disabled={gold.value < 500 || guildName.value.length < 3 || guildTag.value.length < 2}
            >
              Create Guild (500g)
            </button>
          </div>
        </PanelShell>
      </div>
    );
  }

  // Has guild — show guild info
  const members = currentGuild.members || [];
  const onlineMembers = members.filter(m => m.online);
  const myMember = members.find(m => {
    // We don't have our own ID easily, but we can check by being leader/officer
    return false;
  });
  const isLeader = members.some(m => m.rank === 'leader' && m.online);
  const isOfficer = members.some(m => m.rank === 'officer' && m.online);

  return (
    <div class="fixed top-20 left-4 z-50">
      <PanelShell title={`🏰 [${currentGuild.tag}] ${currentGuild.name}`} onClose={() => togglePanel('guild')} width="w-[380px] max-w-[calc(100vw-2rem)]">
        {/* Tabs */}
        <div class="flex gap-1 mb-3 border-b border-rf-border/20 pb-2">
          {(['info', 'members', 'chat'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              class={`px-3 py-1 text-[10px] font-bold uppercase rounded ${
                activeTab.value === tab ? 'bg-rf-accent/20 text-rf-accent' : 'text-rf-muted hover:text-rf-text'
              }`}
              onClick={() => { activeTab.value = tab; }}
            >
              {tab === 'members' ? `Members (${members.length})` : tab}
            </button>
          ))}
        </div>

        <div class="max-h-[55vh] overflow-y-auto pr-1">
          {/* ── Info Tab ── */}
          {activeTab.value === 'info' && (
            <div class="space-y-3">
              <div class="bg-rf-surface-inset/30 rounded p-2 border border-rf-border/10">
                <div class="flex justify-between items-center mb-1">
                  <span class="text-[9px] text-rf-muted uppercase font-bold">Level {currentGuild.level}</span>
                  <span class="text-[9px] text-rf-gold font-bold">💰 {currentGuild.bankGold.toLocaleString()} gold</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-[9px] text-rf-muted">Members: {members.length} ({onlineMembers.length} online)</span>
                  <span class="text-[9px] text-rf-muted">XP: {currentGuild.xp.toLocaleString()}</span>
                </div>
              </div>

              {/* MOTD */}
              <div class="bg-rf-surface-inset/30 rounded p-2 border border-rf-border/10">
                <div class="text-[9px] text-rf-muted uppercase font-bold mb-1">📜 Message of the Day</div>
                <div class="text-xs text-rf-text">
                  {currentGuild.motd || <span class="text-rf-muted italic">No message set.</span>}
                </div>
              </div>

              {/* Set MOTD */}
              <div class="flex gap-1">
                <input
                  type="text"
                  class="flex-1 bg-rf-surface-inset border border-rf-border/30 rounded px-2 py-1 text-[10px] text-rf-text placeholder:text-rf-muted/50 outline-none focus:border-rf-accent/50"
                  placeholder="Set MOTD..."
                  value={motdInput.value}
                  onInput={(e) => { motdInput.value = (e.target as HTMLInputElement).value; }}
                  onFocus={() => InputGate.claimKeyboard('guild-motd')}
                  onBlur={() => InputGate.releaseKeyboard('guild-motd')}
                  maxLength={200}
                />
                <button
                  type="button"
                  class="px-2 py-1 text-[9px] font-bold bg-rf-accent/20 text-rf-accent rounded hover:bg-rf-accent/30"
                  onClick={handleSetMotd}
                >
                  Set
                </button>
              </div>

              {/* Deposit Gold */}
              <div class="flex gap-1">
                <input
                  type="number"
                  class="flex-1 bg-rf-surface-inset border border-rf-border/30 rounded px-2 py-1 text-[10px] text-rf-text placeholder:text-rf-muted/50 outline-none focus:border-rf-accent/50"
                  placeholder="Deposit gold..."
                  value={depositAmount.value}
                  onInput={(e) => { depositAmount.value = (e.target as HTMLInputElement).value; }}
                  onFocus={() => InputGate.claimKeyboard('guild-deposit')}
                  onBlur={() => InputGate.releaseKeyboard('guild-deposit')}
                  min={1}
                />
                <button
                  type="button"
                  class="px-2 py-1 text-[9px] font-bold bg-rf-gold/20 text-rf-gold rounded hover:bg-rf-gold/30"
                  onClick={handleDeposit}
                >
                  💰 Deposit
                </button>
              </div>

              {/* Invite Player */}
              <div class="flex gap-1">
                <input
                  type="text"
                  class="flex-1 bg-rf-surface-inset border border-rf-border/30 rounded px-2 py-1 text-[10px] text-rf-text placeholder:text-rf-muted/50 outline-none focus:border-rf-accent/50"
                  placeholder="Invite player..."
                  value={inviteTarget.value}
                  onInput={(e) => { inviteTarget.value = (e.target as HTMLInputElement).value; }}
                  onFocus={() => InputGate.claimKeyboard('guild-invite')}
                  onBlur={() => InputGate.releaseKeyboard('guild-invite')}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
                />
                <button
                  type="button"
                  class="px-2 py-1 text-[9px] font-bold bg-rf-success/20 text-rf-success rounded hover:bg-rf-success/30"
                  onClick={handleInvite}
                >
                  + Invite
                </button>
              </div>

              {/* Leave Guild */}
              <button
                type="button"
                class="w-full py-1.5 text-[10px] font-bold uppercase bg-rf-danger/10 text-rf-danger/70 rounded hover:bg-rf-danger/20 hover:text-rf-danger"
                onClick={() => {
                  if (confirm('Are you sure you want to leave the guild?')) {
                    sendGuildAction('leave');
                  }
                }}
              >
                Leave Guild
              </button>
            </div>
          )}

          {/* ── Members Tab ── */}
          {activeTab.value === 'members' && (
            <div class="space-y-1">
              {members
                .sort((a, b) => {
                  const rankOrder: Record<string, number> = { leader: 0, officer: 1, member: 2 };
                  const rDiff = (rankOrder[a.rank] ?? 3) - (rankOrder[b.rank] ?? 3);
                  if (rDiff !== 0) return rDiff;
                  return (b.online ? 1 : 0) - (a.online ? 1 : 0);
                })
                .map(member => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    guildLeaderId={currentGuild.leaderId}
                  />
                ))}
            </div>
          )}

          {/* ── Chat Tab ── */}
          {activeTab.value === 'chat' && (
            <div class="flex flex-col h-[40vh]">
              <div class="flex-1 overflow-y-auto mb-2 text-[10px] text-rf-text space-y-0.5">
                <div class="text-rf-muted italic text-center py-4">Guild chat messages appear here and in the main chat.</div>
              </div>
              <div class="flex gap-1">
                <input
                  type="text"
                  class="flex-1 bg-rf-surface-inset border border-rf-border/30 rounded px-2 py-1 text-[10px] text-rf-text placeholder:text-rf-muted/50 outline-none focus:border-rf-accent/50"
                  placeholder="Message guild..."
                  value={chatInput.value}
                  onInput={(e) => { chatInput.value = (e.target as HTMLInputElement).value; }}
                  onFocus={() => InputGate.claimKeyboard('guild-chat')}
                  onBlur={() => InputGate.releaseKeyboard('guild-chat')}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleChat(); }}
                />
                <button
                  type="button"
                  class="px-2 py-1 text-[9px] font-bold bg-rf-accent/20 text-rf-accent rounded hover:bg-rf-accent/30"
                  onClick={handleChat}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </PanelShell>
    </div>
  );
}

function MemberRow({ member, guildLeaderId }: { member: GuildMember; guildLeaderId: string }) {
  const rankIcon = member.rank === 'leader' ? '👑' : member.rank === 'officer' ? '⭐' : '';
  const rankLabel = member.rank.charAt(0).toUpperCase() + member.rank.slice(1);

  return (
    <div class={`flex items-center justify-between bg-rf-surface-inset/30 rounded px-3 py-1.5 border border-rf-border/10 ${!member.online ? 'opacity-50' : ''}`}>
      <div class="flex items-center gap-1.5">
        <span class={`w-1.5 h-1.5 rounded-full ${member.online ? 'bg-rf-success' : 'bg-rf-muted'}`} />
        <span class="text-xs text-rf-text font-semibold">
          {rankIcon} {member.name}
        </span>
        <span class="text-[9px] text-rf-muted">Lv.{member.level} {member.class}</span>
      </div>
      <div class="flex items-center gap-1">
        <span class={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
          member.rank === 'leader' ? 'bg-rf-gold/20 text-rf-gold' :
          member.rank === 'officer' ? 'bg-rf-accent/20 text-rf-accent' :
          'bg-rf-muted/20 text-rf-muted'
        }`}>
          {rankLabel}
        </span>
        {member.rank !== 'leader' && (
          <div class="flex gap-0.5">
            {member.rank === 'member' && (
              <button
                type="button"
                class="text-[8px] text-rf-accent/60 hover:text-rf-accent px-0.5"
                title="Promote to Officer"
                onClick={() => sendGuildAction('promote', { target: member.name })}
              >
                ⬆
              </button>
            )}
            {member.rank === 'officer' && (
              <button
                type="button"
                class="text-[8px] text-rf-warning/60 hover:text-rf-warning px-0.5"
                title="Demote to Member"
                onClick={() => sendGuildAction('demote', { target: member.name })}
              >
                ⬇
              </button>
            )}
            <button
              type="button"
              class="text-[8px] text-rf-danger/60 hover:text-rf-danger px-0.5"
              title="Kick"
              onClick={() => {
                if (confirm(`Kick ${member.name} from the guild?`)) {
                  sendGuildAction('kick', { target: member.name });
                }
              }}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
