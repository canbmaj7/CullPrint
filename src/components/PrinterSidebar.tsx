import React from 'react';
import { Printer, Sparkles, Copy, Keyboard, CheckCircle, AlertCircle, Loader2, Pause, Play } from 'lucide-react';
import { PrinterState, PrinterSettings, PrinterCapabilities } from '../types';
import { describeFinish, FINISH_SECTION_HINT } from '../utils/finish';

interface PrinterSidebarProps {
  printers: PrinterState[];
  selectedPrinter: string;
  onSelectPrinter: (name: string) => void;
  finish: string;
  onChangeFinish: (finish: string) => void;
  copies: number;
  onChangeCopies: (copies: number) => void;
  isPrinting: boolean;
  onPrint: () => void;
  hasPhoto: boolean;
  lastPrintStatus: { success: boolean; message: string } | null;
  currentSettings: PrinterSettings;
  capabilities: PrinterCapabilities | null;
  onOpenSettings: () => void;
  onToggleQueue: () => void;
  isTogglingQueue: boolean;
  cupsJobProblem: string | null;
}

const QUEUE_STATUS_LABELS: Record<string, string> = {
  idle: 'Hazır',
  printing: 'Basıyor',
  disabled: 'Duraklatıldı',
};

export const PrinterSidebar: React.FC<PrinterSidebarProps> = ({
  printers,
  selectedPrinter,
  onSelectPrinter,
  finish,
  onChangeFinish,
  copies,
  onChangeCopies,
  isPrinting,
  onPrint,
  hasPhoto,
  lastPrintStatus,
  currentSettings,
  capabilities,
  onOpenSettings,
  onToggleQueue,
  isTogglingQueue,
  cupsJobProblem,
}) => {
  const activePrinter = printers.find((p) => p.name === selectedPrinter);
  const isQueuePaused = activePrinter?.status === 'disabled';
  // CUPS yazıcı düzeyindeki mesajı bir sonraki başarılı işe kadar saklar (backend yazıcıyla
  // yalnızca baskı sırasında konuşur). Güncel sorun: takılı iş ya da hata ile durmuş kuyruk.
  const stoppedByError = isQueuePaused && !activePrinter?.pausedByUser;
  const currentProblem = cupsJobProblem || (stoppedByError ? activePrinter?.problem : null);
  const lastAttemptProblem = !currentProblem ? activePrinter?.problem : null;

  const mediaOption = capabilities?.options.find((o) => o.name === capabilities.mediaOptionName);
  const mediaChoice = mediaOption?.choices.find((c) => c.value === currentSettings.mediaSize);
  const mediaLabel =
    mediaChoice?.label ||
    (currentSettings.mediaSize === 'w432h576' ? '6x8 (15x20 cm)' : currentSettings.mediaSize);

  const finishOption = capabilities?.finishOptionName
    ? capabilities.options.find((o) => o.name === capabilities.finishOptionName)
    : null;

  const twoFinishChoices =
    capabilities === null
      ? [
          { value: 'Glossy', label: 'Parlak' },
          { value: 'Matte', label: 'Mat' },
        ]
      : finishOption && finishOption.choices.length === 2
      ? finishOption.choices.map((c) => ({
          value: c.value,
          label: c.label === 'Glossy' ? 'Parlak' : c.label === 'Matte' ? 'Mat' : c.label,
        }))
      : null;

  const finishChoice = finishOption?.choices.find((c) => c.value === finish);
  const finishLabel = finishChoice
    ? finishChoice.label === 'Glossy'
      ? 'Parlak'
      : finishChoice.label === 'Matte'
      ? 'Mat'
      : finishChoice.label
    : finish === 'Glossy'
    ? 'Parlak'
    : finish === 'Matte'
    ? 'Mat'
    : finish;

  return (
    <aside className="printer-sidebar">
      {/* 1. Yazıcı Durumu Kartı */}
      <div className="sidebar-card">
        <div className="card-header">
          <div className="card-title-group">
            <Printer size={15} />
            <span className="card-title">Yazıcı İstasyonu</span>
          </div>
          <span
            className={`status-indicator-dot ${
              !activePrinter
                ? 'offline'
                : activePrinter.usbConnected === false
                ? 'warning'
                : 'online'
            }`}
            title={
              activePrinter?.usbConnected === false
                ? 'CUPS Kuyruğu Hazır ancak USB kablosu takılı değil'
                : 'Yazıcı Hazır ve Bağlı'
            }
          />
        </div>

        {printers.length > 0 ? (
          <div className="printer-select-wrapper">
            <select
              className="printer-dropdown"
              value={selectedPrinter}
              onChange={(e) => onSelectPrinter(e.target.value)}
            >
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.isDNP ? `🖨️ ${p.name}` : p.name}
                </option>
              ))}
            </select>
            <div className="queue-status-row">
              <div className="printer-status-text">
                Kuyruk:{' '}
                <b>
                  {!activePrinter
                    ? 'Bilinmiyor'
                    : isQueuePaused && !activePrinter.pausedByUser
                      ? 'Hata ile durdu'
                      : QUEUE_STATUS_LABELS[activePrinter.status] || activePrinter.status}
                </b>
              </div>
              {activePrinter && (
                <button
                  className={`queue-toggle-btn ${isQueuePaused ? 'paused' : ''}`}
                  onClick={onToggleQueue}
                  disabled={isTogglingQueue}
                  title={
                    isQueuePaused
                      ? 'CUPS kuyruğunu devam ettir: bekleyen işler basılmaya başlar'
                      : 'CUPS kuyruğunu duraklat: gönderilen işler kâğıda çıkmadan bekler'
                  }
                >
                  {isTogglingQueue ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : isQueuePaused ? (
                    <Play size={12} />
                  ) : (
                    <Pause size={12} />
                  )}
                  {isQueuePaused ? 'Devam Ettir' : 'Duraklat'}
                </button>
              )}
            </div>

            {currentProblem && (
              <div className="printer-problem-alert" role="alert">
                <AlertCircle size={14} />
                <span>{currentProblem}</span>
              </div>
            )}
            {lastAttemptProblem && (
              <div className="printer-problem-alert stale">
                <AlertCircle size={14} />
                <span>
                  Son baskı denemesinde: {lastAttemptProblem}
                  <small>Bir sonraki baskıda güncellenir.</small>
                </span>
              </div>
            )}

            {isQueuePaused && activePrinter?.pausedByUser && (
              <div className="status-warning-text">
                ⏸ Kuyruk duraklatıldı: gönderilen işler basılmadan bekler
              </div>
            )}

            {/* USB Durum Uyarısı */}
            {activePrinter?.isDNP && activePrinter.usbConnected === false && (
              <div className="status-warning-text">
                ⚠️ USB Kablosu Takılı Değil
              </div>
            )}
            {activePrinter?.mediaRemaining !== undefined && (
              <div
                className="printer-status-text"
                title="Yazıcının son baskı sırasında bildirdiği değer; rulo değişince bir sonraki baskıda güncellenir"
              >
                Kalan kâğıt: <b>{activePrinter.mediaRemaining} baskı</b>
              </div>
            )}
            {activePrinter?.isDNP && activePrinter.usbConnected === true && (
              <div className="printer-status-text" style={{ color: 'var(--success-green)' }}>
                ✓ USB Cihazı Algılandı (Hazır)
              </div>
            )}
          </div>
        ) : (
          <div className="no-printer-alert">
            <AlertCircle size={14} />
            <span>Yazıcı bulunamadı (CUPS kontrol ediliyor...)</span>
          </div>
        )}
      </div>

      {/* 2. Kağıt ve Yüzey Ayarları */}
      <div className="sidebar-card">
        <div className="card-header">
          <div className="card-title-group">
            <Sparkles size={15} />
            <span className="card-title">Baskı Özellikleri</span>
          </div>
          <button
            type="button"
            className="sidebar-settings-link"
            onClick={onOpenSettings}
            title="Yazıcı Ayarlarını Yapılandır"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--accent-blue)',
              fontSize: '11.5px',
              fontWeight: 500,
              cursor: 'pointer',
              padding: '2px 4px',
            }}
          >
            Değiştir
          </button>
        </div>

        <div className="setting-row">
          <span className="setting-label">Kağıt Formatı</span>
          <span className="setting-badge-pill">{mediaLabel}</span>
        </div>

        {twoFinishChoices ? (
          <div className="setting-row">
            <span className="setting-label" title={FINISH_SECTION_HINT}>Baskı Yüzeyi</span>
            <div className="finish-toggle-group">
              {twoFinishChoices.map((choice) => (
                <button
                  key={choice.value}
                  className={`finish-btn ${finish === choice.value ? 'active' : ''}`}
                  onClick={() => onChangeFinish(choice.value)}
                  title={describeFinish(choice.value, choice.label)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="setting-row">
            <span className="setting-label" title={FINISH_SECTION_HINT}>Baskı Yüzeyi</span>
            <span className="setting-badge-pill" title={describeFinish(finish, finishLabel)}>
              {finishLabel || 'Varsayılan'}
            </span>
          </div>
        )}

        {/* Kopya Sayısı */}
        <div className="setting-row copies-row">
          <span className="setting-label">
            <Copy size={13} />
            Kopya Adedi
          </span>
          <div className="copies-stepper">
            <button
              className="stepper-btn"
              onClick={() => onChangeCopies(Math.max(1, copies - 1))}
              disabled={copies <= 1}
            >
              -
            </button>
            <span className="copies-val">{copies}</span>
            <button
              className="stepper-btn"
              onClick={() => onChangeCopies(Math.min(9, copies + 1))}
              disabled={copies >= 9}
            >
              +
            </button>
          </div>
        </div>

        {/* Hızlı Kopya Seçiciler */}
        <div className="quick-copies-chips">
          {[1, 2, 3, 4].map((num) => (
            <button
              key={num}
              className={`quick-copy-chip ${copies === num ? 'active' : ''}`}
              onClick={() => onChangeCopies(num)}
            >
              {num}x
            </button>
          ))}
        </div>
      </div>

      {/* 3. Dev Yazdırma Butonu */}
      <div className="sidebar-action-area">
        <button
          className={`giant-print-btn ${isPrinting ? 'loading' : ''}`}
          onClick={onPrint}
          disabled={!hasPhoto || isPrinting}
        >
          {isPrinting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Kuyruğa Gönderiliyor...</span>
            </>
          ) : (
            <>
              <Printer size={18} />
              <div className="btn-text-block">
                <span className="btn-main-label">YAZDIR</span>
                <span className="btn-sub-label">Space veya Enter</span>
              </div>
            </>
          )}
        </button>

        {/* Son Baskı Bildirimi */}
        {lastPrintStatus && (
          <div
            className={`print-status-banner ${
              lastPrintStatus.success ? 'success' : 'error'
            }`}
          >
            {lastPrintStatus.success ? (
              <CheckCircle size={14} />
            ) : (
              <AlertCircle size={14} />
            )}
            <span>{lastPrintStatus.message}</span>
          </div>
        )}
      </div>

      {/* 4. Klavye Kısayolları Kartı */}
      <div className="sidebar-card shortcuts-card">
        <div className="card-header">
          <div className="card-title-group">
            <Keyboard size={14} />
            <span className="card-title">Klavye Kısayolları</span>
          </div>
        </div>
        <div className="shortcuts-list">
          <div className="shortcut-item">
            <kbd>Space</kbd> / <kbd>Enter</kbd>
            <span>Yazdır</span>
          </div>
          <div className="shortcut-item">
            <kbd>←</kbd> <kbd>→</kbd>
            <span>Önceki / Sonraki Fotoğraf</span>
          </div>
          <div className="shortcut-item">
            <kbd>↑</kbd> <kbd>↓</kbd>
            <span>Kadrajı Kaydır (Kafayı Kurtar)</span>
          </div>
          <div className="shortcut-item">
            <kbd>R</kbd>
            <span>90° Döndür</span>
          </div>
          <div className="shortcut-item">
            <kbd>C</kbd>
            <span>Kadrajı Sıfırla</span>
          </div>
          <div className="shortcut-item">
            <kbd>1</kbd> - <kbd>9</kbd>
            <span>Kopya Sayısını Belirle</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
