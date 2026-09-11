import React, { useState, useEffect } from 'react';
import { X, Printer, Loader2, RotateCw, Check } from 'lucide-react';
import { PrinterCapabilities, PrinterSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  printerName: string;
  capabilities: PrinterCapabilities | null;
  isLoadingCapabilities: boolean;
  currentSettings: PrinterSettings;
  onSave: (settings: PrinterSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  printerName,
  capabilities,
  isLoadingCapabilities,
  currentSettings,
  onSave,
}) => {
  const [localSettings, setLocalSettings] = useState<PrinterSettings>(currentSettings);

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(currentSettings);
    }
  }, [isOpen, currentSettings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleResetDefaults = () => {
    if (!capabilities) return;
    const mediaOpt = capabilities.options.find((o) => o.name === capabilities.mediaOptionName);
    const finishOpt = capabilities.options.find((o) => o.name === capabilities.finishOptionName);

    const defaultMedia = mediaOpt?.choices.find((c) => c.isDefault)?.value;
    const defaultFinish = finishOpt?.choices.find((c) => c.isDefault)?.value;

    setLocalSettings((prev) => ({
      ...prev,
      mediaSize: defaultMedia || prev.mediaSize,
      finishOptionName: capabilities.finishOptionName || prev.finishOptionName,
      finishValue: defaultFinish || prev.finishValue,
    }));
  };

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  return (
    <div className="settings-modal-container queue-drawer-container">
      {/* Arka Plan Karartması */}
      <div className="settings-backdrop queue-backdrop" onClick={onClose} />

      {/* Panel */}
      <aside className="settings-panel queue-panel">
        {/* Başlık ve Kapat Butonu */}
        <div className="settings-header queue-header">
          <div className="queue-header-left">
            <div className="queue-icon-badge">
              <Printer size={18} />
            </div>
            <div>
              <h2 className="queue-title">Yazıcı Ayarları</h2>
              <span className="queue-subtitle">{printerName ? `Yazıcı: ${printerName}` : 'Yazıcı Seçilmedi'}</span>
            </div>
          </div>
          <button className="queue-close-btn" onClick={onClose} title="Kapat (Esc)">
            <X size={18} />
          </button>
        </div>

        {/* İçerik */}
        <div className="settings-content">
          {isLoadingCapabilities ? (
            <div className="settings-loading">
              <Loader2 size={24} className="animate-spin" />
              <span>Yazıcı yetenekleri sorgulanıyor...</span>
            </div>
          ) : !capabilities || capabilities.options.length === 0 ? (
            <div className="settings-empty">
              <p>Yazıcı seçenekleri bulunamadı veya CUPS yanıt vermedi.</p>
              <div className="settings-fallback-field">
                <label className="settings-fallback-label">
                  Medya Boyutu Kodu
                </label>
                <input
                  type="text"
                  className="settings-input"
                  value={localSettings.mediaSize}
                  onChange={(e) => setLocalSettings((prev) => ({ ...prev, mediaSize: e.target.value }))}
                />
              </div>
            </div>
          ) : (
            <div className="settings-options-list">
              {capabilities.options.map((option) => {
                const isMediaOption = option.name === capabilities.mediaOptionName;
                const isFinishOption = option.name === capabilities.finishOptionName;

                if (isMediaOption) {
                  return (
                    <div
                      key={option.name}
                      className="settings-option-card"
                    >
                      <div className="settings-option-header">
                        <span className="settings-option-title">
                          {option.label}{' '}
                          <span className="settings-option-code">({option.name})</span>
                        </span>
                        <span className="setting-badge-pill">Medya Boyutu</span>
                      </div>
                      <div className="settings-choice-grid">
                        {option.choices.map((choice) => {
                          const isSelected = localSettings.mediaSize === choice.value;
                          return (
                            <button
                              key={choice.value}
                              type="button"
                              className={`settings-choice-btn ${isSelected ? 'active' : ''}`}
                              onClick={() => setLocalSettings((prev) => ({ ...prev, mediaSize: choice.value }))}
                            >
                              <span className="settings-choice-label">{choice.label}</span>
                              <span className="settings-choice-value">{choice.value}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                if (isFinishOption) {
                  const currentVal =
                    localSettings.finishValue ||
                    option.choices.find((c) => c.isDefault)?.value ||
                    option.choices[0]?.value;
                  return (
                    <div
                      key={option.name}
                      className="settings-option-card"
                    >
                      <div className="settings-option-header">
                        <span className="settings-option-title">
                          {option.label}{' '}
                          <span className="settings-option-code">({option.name})</span>
                        </span>
                        <span className="setting-badge-pill">Yüzey / Kalite</span>
                      </div>
                      {option.choices.length <= 2 ? (
                        <div className="finish-toggle-group settings-finish-group">
                          {option.choices.map((choice) => (
                            <button
                              key={choice.value}
                              type="button"
                              className={`finish-btn settings-finish-btn ${currentVal === choice.value ? 'active' : ''}`}
                              onClick={() =>
                                setLocalSettings((prev) => ({
                                  ...prev,
                                  finishOptionName: option.name,
                                  finishValue: choice.value,
                                }))
                              }
                            >
                              {choice.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <select
                          className="printer-dropdown settings-select"
                          value={currentVal}
                          onChange={(e) =>
                            setLocalSettings((prev) => ({
                              ...prev,
                              finishOptionName: option.name,
                              finishValue: e.target.value,
                            }))
                          }
                        >
                          {option.choices.map((choice) => (
                            <option key={choice.value} value={choice.value}>
                              {choice.label} {choice.isDefault ? '(Varsayılan)' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                }

                // Diğer CUPS seçenekleri
                const defaultChoice = option.choices.find((c) => c.isDefault) || option.choices[0];
                return (
                  <div
                    key={option.name}
                    className="settings-option-generic"
                  >
                    <div>
                      <span className="settings-generic-label">
                        {option.label}
                      </span>
                      <span className="settings-generic-name">
                        ({option.name})
                      </span>
                    </div>
                    <select
                      className="printer-dropdown settings-generic-select"
                      defaultValue={defaultChoice?.value}
                    >
                      {option.choices.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label} {c.isDefault ? '*' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alt Footer - Varsayılanlara Dön ve Kaydet */}
        <div className="settings-footer queue-footer">
          <button
            type="button"
            className="clear-history-btn"
            onClick={handleResetDefaults}
            disabled={!capabilities || isLoadingCapabilities}
            title="CUPS tarafından bildirilen varsayılan değerlere dön"
          >
            <RotateCw size={13} />
            <span>Varsayılanlara Dön</span>
          </button>
          <button
            type="button"
            className="settings-save-btn"
            onClick={handleSave}
          >
            <Check size={14} />
            <span>Kaydet</span>
          </button>
        </div>
      </aside>
    </div>
  );
};
