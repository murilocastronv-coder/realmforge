import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import { mailbox, commands, inventory, togglePanel, openPanels } from '../../store/GameStore';
import { PanelShell } from '../components/PanelShell';

export function MailPanel() {
  const isOpen = useComputed(() => openPanels.value.has('mail'));
  if (!isOpen.value) return null;
  const mails = mailbox.value;
  const [selectedMail, setSelectedMail] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachGold, setAttachGold] = useState(0);

  const selected = mails.find(m => m.id === selectedMail);
  const unread = mails.filter(m => !m.read).length;

  return (
    <PanelShell title={`📬 Mail ${unread > 0 ? `(${unread})` : ''}`} onClose={() => togglePanel('mail')} width="w-[420px]">
      {composing ? (
        <div class="flex flex-col gap-2 p-2">
          <div class="text-sm font-bold text-amber-400">✉️ Compose Mail</div>
          <input
            class="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
            placeholder="To (username)"
            value={to}
            onInput={(e) => setTo((e.target as HTMLInputElement).value)}
          />
          <input
            class="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
            placeholder="Subject"
            value={subject}
            onInput={(e) => setSubject((e.target as HTMLInputElement).value)}
          />
          <textarea
            class="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white h-20 resize-none"
            placeholder="Message..."
            value={body}
            onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
          />
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-400">Gold:</span>
            <input
              type="number"
              class="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-yellow-400 w-20"
              value={attachGold}
              min={0}
              onInput={(e) => setAttachGold(parseInt((e.target as HTMLInputElement).value) || 0)}
            />
          </div>
          <div class="flex gap-2">
            <button
              class="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm rounded py-1 transition"
              onClick={() => {
                if (to && body) {
                  commands.sendMail(to, subject || 'No Subject', body, attachGold);
                  setComposing(false);
                  setTo(''); setSubject(''); setBody(''); setAttachGold(0);
                }
              }}
            >
              Send ✉️
            </button>
            <button
              class="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded py-1 transition"
              onClick={() => setComposing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : selected ? (
        <div class="flex flex-col gap-2 p-2">
          <button class="text-xs text-blue-400 hover:text-blue-300 self-start" onClick={() => setSelectedMail(null)}>
            ← Back to inbox
          </button>
          <div class="text-sm font-bold text-white">{selected.subject}</div>
          <div class="text-xs text-gray-400">From: <span class="text-cyan-400">{selected.from}</span></div>
          <div class="bg-gray-800 rounded p-2 text-sm text-gray-200 min-h-[60px]">{selected.body}</div>
          {selected.hasAttachment && (
            <div class="flex items-center gap-2 bg-gray-800/50 rounded p-2">
              {selected.gold > 0 && <span class="text-yellow-400 text-sm">💰 {selected.gold}g</span>}
              {selected.item && <span class="text-green-400 text-sm">📦 {selected.item.name}</span>}
              <button
                class="ml-auto bg-amber-700 hover:bg-amber-600 text-white text-xs rounded px-2 py-1 transition"
                onClick={() => commands.claimMail(selected.id)}
              >
                Claim
              </button>
            </div>
          )}
          <button
            class="bg-red-800 hover:bg-red-700 text-white text-xs rounded py-1 transition"
            onClick={() => { commands.deleteMail(selected.id); setSelectedMail(null); }}
          >
            🗑️ Delete
          </button>
        </div>
      ) : (
        <div class="flex flex-col gap-1 p-2">
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs text-gray-400">{mails.length} messages</span>
            <button
              class="bg-blue-700 hover:bg-blue-600 text-white text-xs rounded px-3 py-1 transition"
              onClick={() => { setComposing(true); commands.listMail(); }}
            >
              ✏️ Compose
            </button>
          </div>
          {mails.length === 0 ? (
            <div class="text-center text-gray-500 text-sm py-4">📭 No mail</div>
          ) : (
            <div class="flex flex-col gap-1 max-h-[300px] overflow-y-auto scrollbar-thin">
              {mails.map(mail => (
                <button
                  key={mail.id}
                  class={`flex items-center gap-2 p-2 rounded text-left transition hover:bg-gray-700/50 ${!mail.read ? 'bg-gray-700/30 border-l-2 border-cyan-400' : ''}`}
                  onClick={() => { setSelectedMail(mail.id); commands.readMail(mail.id); }}
                >
                  <span class="text-lg">{mail.hasAttachment ? '📎' : mail.read ? '📧' : '📬'}</span>
                  <div class="flex-1 min-w-0">
                    <div class={`text-sm truncate ${!mail.read ? 'text-white font-bold' : 'text-gray-300'}`}>{mail.subject}</div>
                    <div class="text-xs text-gray-500">From: {mail.from}</div>
                  </div>
                  {mail.gold > 0 && <span class="text-yellow-400 text-xs">{mail.gold}g</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </PanelShell>
  );
}
