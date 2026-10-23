import { useSignal, useComputed } from '@preact/signals';
import { useEffect, useRef, useCallback } from 'preact/hooks';
import { chatMessages, addChatMessage, commands, type ChatMessage } from '../../store/GameStore';
import { InputGate } from '../../services/InputGate';
import { channelTextClass } from '../lib/rarity';

type Channel = 'global' | 'local' | 'trade' | 'guild';

const CHANNELS: Channel[] = ['global', 'local', 'trade', 'guild'];

/**
 * ChatBox — game chat with channels, commands, and native input.
 * Replaces Phaser ChatBox (340 LOC) with full HTML implementation.
 */
export function ChatBox() {
  const currentChannel = useSignal<Channel>('global');
  const inputActive = useSignal(false);
  const minimized = useSignal(false);
  const hiddenOnMobile = useSignal(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const messages = useComputed(() => chatMessages.value);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages.value.length]);

  const activateInput = useCallback((prefix = '') => {
    inputActive.value = true;
    InputGate.claimFocus('chat');
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.value = prefix;
        inputRef.current.focus();
      }
    }, 0);
  }, []);

  const deactivateInput = useCallback(() => {
    inputActive.value = false;
    InputGate.releaseFocus('chat');
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.blur();
    }
  }, []);

  const sendMessage = useCallback(() => {
    if (!inputRef.current) return;
    const text = inputRef.current.value.trim();
    if (!text) return;

    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const cmd = parts[0].toLowerCase();
      const rest = parts.slice(1).join(' ');

      switch (cmd) {
        case '/g':
        case '/global':
          currentChannel.value = 'global';
          if (rest) commands.sendChat('global', rest);
          deactivateInput();
          return;
        case '/l':
        case '/local':
          currentChannel.value = 'local';
          if (rest) commands.sendChat('local', rest);
          deactivateInput();
          return;
        case '/t':
        case '/trade':
          currentChannel.value = 'trade';
          if (rest) commands.sendChat('trade', rest);
          deactivateInput();
          return;
        case '/help':
          addChatMessage('system', 'System', 'Commands: /g /l /t /w <player> <msg> /tutorial /help');
          deactivateInput();
          return;
      }
    }

    commands.sendChat(currentChannel.value, text);
    deactivateInput();
  }, []);

  // Global keyboard listener for Enter and /
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (InputGate.hasFocus && !inputActive.value) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        if (inputActive.value) {
          sendMessage();
        } else {
          activateInput();
        }
      } else if (e.key === '/' && !inputActive.value) {
        e.preventDefault();
        activateInput('/');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const formatMessage = (msg: ChatMessage) => {
    const prefix = msg.channel === 'system' ? '⚙ ' : msg.channel === 'combat' ? '⚔ ' : msg.channel === 'guild' ? '🏰 ' : '';
    return `${prefix}[${msg.sender}]: ${msg.text}`;
  };

  if (hiddenOnMobile.value) return <button data-interactive type="button" aria-label="Reabrir chat" class="rf-chat-reopen fixed bottom-4 left-4 z-[95] rounded-lg border border-rf-border bg-rf-chrome-header px-4 py-3 text-sm font-bold text-rf-gold shadow-lg" onClick={() => { hiddenOnMobile.value = false; }}>💬 CHAT</button>;

  return (
    <div
      data-interactive
      class="rf-chat-window fixed bottom-4 left-4 w-[360px] max-w-[calc(100vw-2rem)] flex flex-col rounded border border-rf-border-muted bg-rf-surface/80 backdrop-blur-sm shadow-lg shadow-rf-shadow/40"
      onMouseEnter={() => InputGate.claimPointer('chat')}
      onMouseLeave={() => InputGate.releasePointer('chat')}
    >
      {/* Header with channel tabs */}
      <div class="flex items-center gap-1 px-2 py-1 border-b border-rf-chrome-trim bg-rf-chrome-header/80 rounded-t">
        {CHANNELS.map((ch) => (
          <button
            key={ch}
            class={`text-[11px] font-bold uppercase px-2 py-0.5 rounded transition-colors ${
              currentChannel.value === ch
                ? `${channelTextClass(ch)} bg-rf-surface-inset`
                : 'text-rf-text-dim hover:text-rf-text-muted'
            }`}
            onClick={() => { currentChannel.value = ch; }}
          >
            {ch}
          </button>
        ))}
        <span class="flex-1" />
        <span class={`text-[10px] ${channelTextClass(currentChannel.value)}`}>
          [{currentChannel.value}]
        </span>
        <button
          class="text-rf-text-dim hover:text-rf-text ml-1 text-sm leading-none"
          onClick={() => { minimized.value = !minimized.value; }}
          title={minimized.value ? 'Expand' : 'Minimize'}
        >
          {minimized.value ? '▪' : '−'}
        </button>
        <button type="button" class="rf-chat-close ml-1 text-sm leading-none" onClick={() => { inputActive.value = false; InputGate.releaseFocus('chat'); hiddenOnMobile.value = true; }} title="Close chat" aria-label="Fechar chat">✕</button>
      </div>

      {/* Messages */}
      {!minimized.value && (
        <div
          ref={messagesRef}
          class="h-[160px] overflow-y-auto px-2 py-1 space-y-0.5"
        >
          {messages.value.slice(-50).map((msg, i) => (
            <div
              key={msg.id}
              class={`text-[11px] leading-snug ${channelTextClass(msg.channel)} break-words animate-msg-in`}
              style={i >= messages.value.length - 3 ? {} : { animationDuration: '0s' }}
            >
              {formatMessage(msg)}
            </div>
          ))}
          {messages.value.length === 0 && (
            <div class="text-[11px] text-rf-text-dim italic mt-2">Press ENTER to chat...</div>
          )}
        </div>
      )}

      {/* Input */}
      {!minimized.value && (
        <div class="border-t border-rf-chrome-trim px-2 py-1">
          <input
            ref={inputRef}
            type="text"
            maxLength={200}
            placeholder="Press ENTER to chat..."
            class={`w-full bg-rf-chrome-inset border border-rf-border-muted rounded px-2 py-1 text-[11px] text-rf-text placeholder:text-rf-text-dim/50 outline-none focus:border-rf-accent transition-colors ${
              inputActive.value ? 'block' : 'hidden'
            }`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                deactivateInput();
              }
              e.stopPropagation();
            }}
            onBlur={() => deactivateInput()}
          />
        </div>
      )}
    </div>
  );
}
