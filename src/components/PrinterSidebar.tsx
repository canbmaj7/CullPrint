import React from 'react';
import { Printer, Sparkles, Copy, Keyboard, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { PrinterState } from '../types';

interface PrinterSidebarProps {
  printers: PrinterState[];
  selectedPrinter: string;
  onSelectPrinter: (name: string) => void;
  finish: 'Glossy' | 'Matte';
  onChangeFinish: (finish: 'Glossy' | 'Matte') => void;
  copies: number;
  onChangeCopies: (copies: number) => void;
  isPrinting: boolean;
  onPrint: () => void;
  hasPhoto: boolean;
  lastPrintStatus: { success: boolean; message: string } | null;
}

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
}) => {
  const activePrinter = printers.find((p) => p.name === selectedPrinter);

  return (
    <aside className="printer-sidebar">
      {/* 1. Yazıcı Durumu Kartı */}
      <div className="sidebar-card">
        <div className="card-header">
          <div className="card-title-group">
            <Printer size={15} />
            <span className="card-title">Yazıcı İstasyonu</span>
          </div>
          <span className={`status-indicator-dot ${activePrinter ? 'online' : 'offline'}`} />
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
            <div className="printer-status-text">
              Durum: <b>{activePrinter?.status || 'Bilinmiyor'}</b>
            </div>
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
        </div>

        <div className="setting-row">
          <span className="setting-label">Kağıt Formatı</span>
          <span className="setting-badge-pill">6x8 (15x20 cm)</span>
        </div>

        <div className="setting-row">
          <span className="setting-label">Baskı Yüzeyi</span>
          <div className="finish-toggle-group">
            <button
              className={`finish-btn ${finish === 'Glossy' ? 'active' : ''}`}
              onClick={() => onChangeFinish('Glossy')}
            >
              Parlak
            </button>
            <button
              className={`finish-btn ${finish === 'Matte' ? 'active' : ''}`}
              onClick={() => onChangeFinish('Matte')}
            >
              Mat
            </button>
          </div>
        </div>

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
                <span className="btn-main-label">YAZDIR & İLERLE</span>
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
            <span>Yazdır & Sonrakine Geç</span>
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
