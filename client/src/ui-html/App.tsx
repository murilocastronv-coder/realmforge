import { useComputed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { isAuthenticated, isDead, showStatAllocation, showTutorial, openPanels, togglePanel } from '../store/GameStore';
import { initAudio, setMasterVolume, setSfxVolume, setMusicVolume } from '../systems/AudioSystem';
import { getSettings } from './panels/SettingsPanel';
import { LoginScreen } from './screens/LoginScreen';
import { LoadingScreen } from './screens/LoadingScreen';
import { DeathOverlay } from './overlays/DeathOverlay';
import { TutorialOverlay } from './overlays/TutorialOverlay';
import { StatsBar } from './hud/StatsBar';
import { BuffBar } from './hud/BuffBar';
import { SkillHotbar } from './hud/SkillHotbar';
import { QuestTracker } from './hud/QuestTracker';
import { EntityTooltip } from './hud/EntityTooltip';
import { ContextMenu } from './hud/ContextMenu';
import { WorldEventBanner } from './hud/WorldEventBanner';
import { ToastStack } from './hud/ToastStack';
import { PartyHUD, PartyInviteToast } from './hud/PartyHUD';
import { EmoteWheel } from './hud/EmoteWheel';
import { DeathRecapWidget } from './hud/DeathRecapWidget';
import { ItemTooltipOverlay } from './hud/ItemTooltipOverlay';
import { CombatLogMini } from './panels/CombatLogPanel';
import { ChatBox } from './panels/ChatBox';
import { InventoryPanel } from './panels/InventoryPanel';
import { EquipmentPanel } from './panels/EquipmentPanel';
import { BankPanel } from './panels/BankPanel';
import { CraftingPanel } from './panels/CraftingPanel';
import { MarketplacePanel } from './panels/MarketplacePanel';
import { QuestPanel } from './panels/QuestPanel';
import { NpcDialoguePanel } from './panels/NpcDialoguePanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { CharacterPanel } from './panels/CharacterPanel';
import { AchievementPanel, AchievementToast } from './panels/AchievementPanel';
import { CombatLogPanel } from './panels/CombatLogPanel';
import { SocialPanel } from './panels/SocialPanel';
import { InspectPanel } from './panels/InspectPanel';
import { WorldMapPanel } from './panels/WorldMapPanel';
import { LeaderboardPanel } from './panels/LeaderboardPanel';
import { TradePanel } from './panels/TradePanel';
import { SkillTreePanel } from './panels/SkillTreePanel';
import { GuildPanel } from './panels/GuildPanel';
import { EnchantPanel } from './panels/EnchantPanel';
import { StatAllocationModal } from './modals/StatAllocationModal';

/**
 * Root UI component — renders over the Phaser canvas.
 * Shows LoginScreen before auth, game UI after auth.
 */
export function App() {
  const authed = useComputed(() => isAuthenticated.value);
  const dead = useComputed(() => isDead.value);
  const tutorial = useComputed(() => showTutorial.value);
  const statAlloc = useComputed(() => showStatAllocation.value);
  const panels = useComputed(() => openPanels.value);

  // Initialize audio system with saved settings
  useEffect(() => {
    initAudio();
    const s = getSettings();
    setMasterVolume(s.masterVolume / 100);
    setSfxVolume(s.sfxVolume / 100);
    setMusicVolume(s.musicVolume / 100);
  }, []);

  if (!authed.value) {
    return (
      <>
        <LoadingScreen />
        <LoginScreen onLogin={() => { /* Phaser GameScene start handled by AuthService */ }} />
      </>
    );
  }

  return (
    <>
      {/* HUD — always visible */}
      <StatsBar />
      <BuffBar />
      <SkillHotbar />
      <QuestTracker />
      <PartyHUD />
      <CombatLogMini />
      <ChatBox />
      <ToastStack />
      <EntityTooltip />
      <ItemTooltipOverlay />
      <WorldEventBanner />
      <ContextMenu />
      <EmoteWheel />
      <AchievementToast />

      {/* Panels — toggled by openPanels signal */}
      <InventoryPanel />
      <EquipmentPanel />
      <BankPanel />
      <CraftingPanel />
      <MarketplacePanel />
      <QuestPanel />
      <NpcDialoguePanel />
      {panels.value.has('settings') && <SettingsPanel onClose={() => togglePanel('settings')} />}
      {panels.value.has('character') && <CharacterPanel onClose={() => togglePanel('character')} />}
      {panels.value.has('achievements') && <AchievementPanel onClose={() => togglePanel('achievements')} />}
      {panels.value.has('combatlog') && <CombatLogPanel onClose={() => togglePanel('combatlog')} />}
      {panels.value.has('social') && <SocialPanel onClose={() => togglePanel('social')} />}
      {panels.value.has('worldmap') && <WorldMapPanel onClose={() => togglePanel('worldmap')} />}
      {panels.value.has('leaderboard') && <LeaderboardPanel onClose={() => togglePanel('leaderboard')} />}
      <SkillTreePanel />
      <GuildPanel />
      <EnchantPanel />
      <InspectPanel />
      <TradePanel />

      {/* Modals & Overlays */}
      <PartyInviteToast />
      {statAlloc.value && <StatAllocationModal />}
      {tutorial.value && <TutorialOverlay />}
      {dead.value && <DeathOverlay />}
    </>
  );
}
