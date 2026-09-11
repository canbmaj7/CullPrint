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
        <div className="settings-content" style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          {isLoadingCapabilities ? (
            <div
              className="settings-loading"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 0',
                gap: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              <Loader2 size={24} className="animate-spin" />
              <span>Yazıcı yetenekleri sorgulanıyor...</span>
            </div>
          ) : !capabilities || capabilities.options.length === 0 ? (
            <div
              className="settings-empty"
              style={{
                textAlign: 'center',
                padding: '36px 0',
                color: 'var(--text-secondary)',
                fontSize: '13px',
              }}
            >
              <p>Yazıcı seçenekleri bulunamadı veya CUPS yanıt vermedi.</p>
              <div style={{ marginTop: '16px', textAlign: 'left' }}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Medya Boyutu Kodu
                </label>
                <input
                  type="text"
                  className="settings-input"
                  value={localSettings.mediaSize}
                  onChange={(e) => setLocalSettings((prev) => ({ ...prev, mediaSize: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="settings-options-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {capabilities.options.map((option) => {
                const isMediaOption = option.name === capabilities.mediaOptionName;
                const isFinishOption = option.name === capabilities.finishOptionName;

                if (isMediaOption) {
                  return (
                    <div
                      key={option.name}
                      className="settings-option-card"
                      style={{
                        background: 'var(--bg-card)',
                        padding: '14px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '10px',
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                          {option.label}{' '}
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({option.name})</span>
                        </span>
                        <span className="setting-badge-pill">Medya Boyutu</span>
                      </div>
                      <div
                        className="settings-choice-grid"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                          gap: '8px',
                        }}
                      >
                        {option.choices.map((choice) => {
                          const isSelected = localSettings.mediaSize === choice.value;
                          return (
                            <button
                              key={choice.value}
                              type="button"
                              className={`settings-choice-btn ${isSelected ? 'active' : ''}`}
                              onClick={() => setLocalSettings((prev) => ({ ...prev, mediaSize: choice.value }))}
                              style={{
                                padding: '8px 10px',
                                borderRadius: 'var(--radius-sm)',
                                border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
                                background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-panel)',
                                color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '2px',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <span style={{ fontWeight: 600, fontSize: '13px' }}>{choice.label}</span>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontFamily: 'var(--font-mono)',
                                  color: isSelected ? 'var(--accent-blue)' : 'var(--text-muted)',
                                }}
                              >
                                {choice.value}
                              </span>
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
                      style={{
                        background: 'var(--bg-card)',
                        padding: '14px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '10px',
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                          {option.label}{' '}
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({option.name})</span>
                        </span>
                        <span className="setting-badge-pill">Yüzey / Kalite</span>
                      </div>
                      {option.choices.length <= 2 ? (
                        <div className="finish-toggle-group" style={{ display: 'flex', gap: '4px' }}>
                          {option.choices.map((choice) => (
                            <button
                              key={choice.value}
                              type="button"
                              className={`finish-btn ${currentVal === choice.value ? 'active' : ''}`}
                              onClick={() =>
                                setLocalSettings((prev) => ({
                                  ...prev,
                                  finishOptionName: option.name,
                                  finishValue: choice.value,
                                }))
                              }
                              style={{ flex: 1, padding: '8px' }}
                            >
                              {choice.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <select
                          className="printer-dropdown"
                          value={currentVal}
                          onChange={(e) =>
                            setLocalSettings((prev) => ({
                              ...prev,
                              finishOptionName: option.name,
                              finishValue: e.target.value,
                            }))
                          }
                          style={{ width: '100%', padding: '8px 10px' }}
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {option.label}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                        ({option.name})
                      </span>
                    </div>
                    <select
                      className="printer-dropdown"
                      defaultValue={defaultChoice?.value}
                      style={{ maxWidth: '180px', padding: '4px 8px', fontSize: '12px' }}
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
        <div
          className="settings-footer queue-footer"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-card)',
          }}
        >
          <button
            type="button"
            className="clear-history-btn"
            onClick={handleResetDefaults}
            disabled={!capabilities || isLoadingCapabilities}
            title="CUPS tarafından bildirilen varsayılan değerlere dön"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RotateCw size={13} />
            <span>Varsayılanlara Dön</span>
          </button>
          <button
            type="button"
            className="settings-save-btn"
            onClick={handleSave}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-blue)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '12.5px',
              cursor: 'pointer',
            }}
          >
            <Check size={14} />
            <span>Kaydet</span>
          </button>
        </div>
      </aside>
    </div>
  );
};
