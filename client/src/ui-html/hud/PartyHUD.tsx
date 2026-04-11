import { useComputed, useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { InputGate } from '../../services/InputGate';

// ─── Party State ─────────────────────────────────────────────
export interface PartyMember {
  id: string;
  name: string;
  level: number;
  playerClass: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  isLeader: boolean;
  isOnline: boolean;
}

export const partyMembers = signal<PartyMember[]>([]);
export const partyInvite = signal<{ from: string; partyId: string } | null>(null);
export const isInParty = signal<boolean>(false);

export function setPartyMembers(members: PartyMember[]): void {
  partyMembers.value = members;
  isInParty.value = members.length > 0;
}

export function clearParty(): void {
  partyMembers.value = [];
  isInParty.value = false;
}

/**
 * PartyHUD — compact party member health bars on left side.
 */
export function PartyHUD() {
  const members = useComputed(() => partyMembers.value);

  if (members.value.length === 0) return null;

  return (
    <div
      data-interactive
      class="fixed top-[180px] left-4 w-[160px] space-y-1"
      onMouseEnter={() => InputGate.claimPointer('party-hud')}
      onMouseLeave={() => InputGate.releasePointer('party-hud')}
    >
      <div class="text-[9px] font-bold text-rf-muted uppercase tracking-wider">👥 Party</div>
      {members.value.map(member => (
        <PartyMemberBar key={member.id} member={member} />
      ))}
    </div>
  );
}

function PartyMemberBar({ member }: { member: PartyMember }) {
  const hpPct = member.maxHp > 0 ? (member.hp / member.maxHp) * 100 : 0;
  const mpPct = member.maxMp > 0 ? (member.mp / member.maxMp) * 100 : 0;
  const hpColor = hpPct > 50 ? 'bg-rf-success' : hpPct > 25 ? 'bg-rf-warning' : 'bg-rf-danger';

  return (
    <div class={`bg-rf-surface/80 border border-rf-border/30 rounded px-2 py-1 ${!member.isOnline ? 'opacity-40' : ''}`}>
      <div class="flex items-center justify-between mb-0.5">
        <span class="text-[10px] font-semibold text-rf-text truncate max-w-[100px]">
          {member.isLeader && '👑 '}{member.name}
        </span>
        <span class="text-[8px] text-rf-muted">Lv.{member.level}</span>
      </div>
      {/* HP */}
      <div class="h-1.5 bg-rf-surface-inset rounded-full overflow-hidden mb-0.5">
        <div class={`h-full ${hpColor} transition-all duration-300`} style={{ width: `${hpPct}%` }} />
      </div>
      {/* MP */}
      <div class="h-1 bg-rf-surface-inset rounded-full overflow-hidden">
        <div class="h-full bg-blue-500/70 transition-all duration-300" style={{ width: `${mpPct}%` }} />
      </div>
    </div>
  );
}

/**
 * PartyInviteToast — shows incoming party invite.
 */
export function PartyInviteToast() {
  const invite = useComputed(() => partyInvite.value);

  if (!invite.value) return null;

  return (
    <div
      data-interactive
      class="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 animate-panel-in"
    >
      <div class="bg-rf-surface border border-rf-accent/40 rounded-xl shadow-2xl px-6 py-4 text-center min-w-[260px]">
        <div class="text-sm text-rf-text mb-1">👥 Party Invite</div>
        <div class="text-base font-bold text-rf-accent mb-3">{invite.value.from}</div>
        <div class="text-xs text-rf-muted mb-4">wants you to join their party</div>
        <div class="flex gap-2 justify-center">
          <button
            type="button"
            class="px-4 py-1.5 text-xs font-bold bg-rf-success/20 text-rf-success border border-rf-success/30 rounded-lg hover:bg-rf-success/30 transition-colors"
            onClick={() => {
              // Would send AcceptPartyInvite to server
              partyInvite.value = null;
            }}
          >
            Accept
          </button>
          <button
            type="button"
            class="px-4 py-1.5 text-xs font-bold bg-rf-danger/20 text-rf-danger border border-rf-danger/30 rounded-lg hover:bg-rf-danger/30 transition-colors"
            onClick={() => { partyInvite.value = null; }}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
