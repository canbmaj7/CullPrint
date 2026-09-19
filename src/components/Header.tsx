import React from 'react';
import {
  FolderOpen,
  PlusSquare,
  CheckCircle2,
  Image as ImageIcon,
  Filter,
  Sun,
  Moon,
  Eye,
  ListOrdered,
  Settings,
} from 'lucide-react';
import { FilterMode, ThemeMode } from '../types';
import appIcon from '../../build/icon.svg';

interface HeaderProps {
  currentFolder: string | null;
  totalCount: number;
  printedCount: number;
  unprintedCount: number;
  filterMode: FilterMode;
  theme: ThemeMode;
  queueCount: number;
  activeJobCount: number;
  onSelectFolder: () => void;
  onSelectFiles: () => void;
  onToggleTheme: () => void;
  onFilterChange: (mode: FilterMode) => void;
  onToggleQueue: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentFolder,
  totalCount,
  printedCount,
  unprintedCount,
  filterMode,
  theme,
  queueCount,
  activeJobCount,
  onSelectFolder,
  onSelectFiles,
  onToggleTheme,
  onFilterChange,
  onToggleQueue,
  onOpenSettings,
}) => {
  return (
    <header className="header-container">
      {/* Sol: Logo ve İsim */}
      <div className="header-brand">
        <img className="brand-logo" src={appIcon} alt="" draggable={false} />
        <div className="brand-text">
          <span className="brand-title">CullPrint</span>
          <span className="brand-subtitle">Seç · Kadrajla · Bas</span>
        </div>
      </div>

      {/* Orta: Klasör Seçici, Fotoğraf Ekle ve Yol */}
      <div className="header-folder-section">
        <button className="folder-select-btn" onClick={onSelectFolder} title="SD Kart veya Klasör Seç">
          <FolderOpen size={15} />
          <span>{currentFolder ? 'Klasör Değiştir' : 'Klasör Seç'}</span>
        </button>

        <button className="folder-select-btn" onClick={onSelectFiles} title="Tekil veya Çoklu Fotoğraf Ekle">
          <PlusSquare size={15} />
          <span>Fotoğraf Ekle</span>
        </button>

        {currentFolder && (
          <div className="folder-path-display" title={currentFolder}>
            {currentFolder}
          </div>
        )}
      </div>

      {/* Sağ: İstatistikler, Filtre, Kuyruk Butonu ve Tema Değiştirici */}
      <div className="header-actions">
        {totalCount > 0 && (
          <div className="filter-group">
            <span className="filter-label">
              <Filter size={13} />
            </span>
            <button
              className={`filter-tab ${filterMode === 'all' ? 'active' : ''}`}
              onClick={() => onFilterChange('all')}
            >
              <ImageIcon size={13} />
              Tümü ({totalCount})
            </button>
            <button
              className={`filter-tab ${filterMode === 'unprinted' ? 'active' : ''}`}
              onClick={() => onFilterChange('unprinted')}
            >
              Basılmayan ({unprintedCount})
            </button>
            <button
              className={`filter-tab printed ${filterMode === 'printed' ? 'active' : ''}`}
              onClick={() => onFilterChange('printed')}
            >
              <CheckCircle2 size={13} />
              Basılan ({printedCount})
            </button>
          </div>
        )}

        {/* Baskı Kuyruğu Çekmece Butonu */}
        <button
          className={`queue-trigger-btn ${activeJobCount > 0 ? 'has-active' : ''}`}
          onClick={onToggleQueue}
          title="Baskı Kuyruğu & Geçmişi (Q)"
        >
          <ListOrdered size={15} />
          <span>Kuyruk</span>
          {queueCount > 0 && <span className="queue-badge">{queueCount}</span>}
          {activeJobCount > 0 && <span className="queue-pulse-dot" />}
        </button>

        {/* Tema Değiştirici Buton */}
        <button
          className="theme-switch-btn"
          onClick={onToggleTheme}
          title={`Tema Değiştir (Şu an: ${
            theme === 'dark' ? 'Koyu Stüdyo' : theme === 'light' ? 'Açık Stüdyo' : '%18 Nötr Gri'
          })`}
        >
          {theme === 'dark' && <Moon size={15} />}
          {theme === 'light' && <Sun size={15} />}
          {theme === 'neutral' && <Eye size={15} />}
        </button>

        {/* Yazıcı Ayarları Butonu */}
        <button
          className="theme-switch-btn settings-trigger-btn"
          onClick={onOpenSettings}
          title="Yazıcı Ayarları"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
};
