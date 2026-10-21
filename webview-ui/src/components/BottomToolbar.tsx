import { Button } from './ui/Button.js';

interface BottomToolbarProps {
  isEditMode: boolean;
  onToggleEditMode: () => void;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
}

export function BottomToolbar({
  isEditMode,
  onToggleEditMode,
  isSettingsOpen,
  onToggleSettings,
}: BottomToolbarProps) {
  return (
    <div className="absolute bottom-10 left-10 z-20 flex items-center gap-4 pixel-panel p-4">
      <Button
        variant={isEditMode ? 'active' : 'default'}
        onClick={onToggleEditMode}
        title="Edit office layout"
      >
        Layout
      </Button>
      <Button
        variant={isSettingsOpen ? 'active' : 'default'}
        onClick={onToggleSettings}
        title="Settings"
      >
        Settings
      </Button>
    </div>
  );
}
