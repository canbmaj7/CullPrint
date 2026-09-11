import React from 'react';
import { FolderOpen, Printer, CheckCircle2, Image as ImageIcon, Filter } from 'lucide-react';
import { FilterMode } from '../types';

interface HeaderProps {
  currentFolder: string | null;
  totalCount: number;
  printedCount: number;
  unprintedCount: number;
  filterMode: FilterMode;
  onSelectFolder: () => void;
  onFilterChange: (mode: FilterMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentFolder,
  totalCount,
  printedCount,
  unprintedCount,
  filterMode,
  onSelectFolder,
  onFilterChange,
}) => {
  return (
    <header className="header-container">
      {/* Sol: Logo ve İsim */}
      <div className="header-brand">
        <div className="brand-icon">
          <Printer size={18} />
        </div>
        <div className="brand-text">
          <span className="brand-title">CullPrint</span>
          <span className="brand-subtitle">DS620 Pro</span>
        </div>
      </div>

      {/* Orta: Klasör Seçici ve Yol */}
      <div className="header-folder-section">
        <button className="folder-select-btn" onClick={onSelectFolder} title="SD Kart veya Fotoğraf Klasörü Seç">
          <FolderOpen size={16} />
          <span>{currentFolder ? 'Klasör Değiştir' : 'Fotoğraf Klasörü Seç'}</span>
        </button>
        {currentFolder && (
          <div className="folder-path-display" title={currentFolder}>
            {currentFolder}
          </div>
        )}
      </div>

      {/* Sağ: İstatistikler ve Filtre */}
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
      </div>
    </header>
  );
};
