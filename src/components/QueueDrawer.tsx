import React, { useState } from 'react';
import {
  X,
  Printer,
  RotateCw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  Ban,
  RefreshCw,
} from 'lucide-react';
import { PrintJob } from '../types';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  queue: PrintJob[];
  onCancelJob: (job: PrintJob) => void;
  onReprintJob: (job: PrintJob) => void;
  onClearHistory: () => void;
  rollPrintsCount: number;
  onResetRoll: () => void;
  rollCapacity?: number; // default 200 for 6x8 paper
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  isOpen,
  onClose,
  queue,
  onCancelJob,
  onReprintJob,
  onClearHistory,
  rollPrintsCount,
  onResetRoll,
  rollCapacity = 200,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'history'>('all');

  if (!isOpen) return null;

  const activeJobs = queue.filter((j) => j.status === 'printing' || j.status === 'queued');
  const historyJobs = queue.filter(
    (j) => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled'
  );

  const displayedJobs =
    activeTab === 'active'
      ? activeJobs
      : activeTab === 'history'
      ? historyJobs
      : queue;

  const rollPercentage = Math.min(100, Math.round((rollPrintsCount / rollCapacity) * 100));

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="queue-drawer-container">
      {/* Arka Plan Karartması (Backdrop) */}
      <div className="queue-backdrop" onClick={onClose} />

      {/* Sağdan Kayan Panel */}
      <aside className="queue-panel">
        {/* Başlık ve Kapat Butonu */}
        <div className="queue-header">
          <div className="queue-header-left">
            <div className="queue-icon-badge">
              <Printer size={18} />
            </div>
            <div>
              <h2 className="queue-title">Baskı Kuyruğu</h2>
              <span className="queue-subtitle">
                {activeJobs.length > 0 ? `${activeJobs.length} iş işleniyor / sırada` : 'Yazıcı boşta'}
              </span>
            </div>
          </div>
          <button className="queue-close-btn" onClick={onClose} title="Kapat (Esc)">
            <X size={18} />
          </button>
        </div>

        {/* DNP DS620 Rulo Kağıt Tüketim Sayacı */}
        <div className="roll-meter-card">
          <div className="roll-meter-header">
            <div className="roll-meter-title">
              <Layers size={14} />
              <span>DNP DS620 Kağıt Rulosu (6x8)</span>
            </div>
            <button
              className="roll-reset-btn"
              onClick={onResetRoll}
              title="Yeni rulo takıldığında sayacı sıfırla"
            >
              <RotateCw size={12} />
              <span>Ruloyu Sıfırla</span>
            </button>
          </div>
          <div className="roll-meter-bar-bg">
            <div
              className={`roll-meter-bar-fill ${rollPercentage > 85 ? 'danger' : rollPercentage > 70 ? 'warning' : ''}`}
              style={{ width: `${rollPercentage}%` }}
            />
          </div>
          <div className="roll-meter-info">
            <span>
              Kullanılan: <b>{rollPrintsCount}</b> / {rollCapacity} baskı
            </span>
            <span>Kalan: <b>{Math.max(0, rollCapacity - rollPrintsCount)}</b></span>
          </div>
        </div>

        {/* Sekmeler (Tabs) */}
        <div className="queue-tabs">
          <button
            className={`queue-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            Tümü ({queue.length})
          </button>
          <button
            className={`queue-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Sırada ({activeJobs.length})
            {activeJobs.length > 0 && <span className="tab-pulse-dot" />}
          </button>
          <button
            className={`queue-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Geçmiş ({historyJobs.length})
          </button>
        </div>

        {/* İş Listesi */}
        <div className="queue-list">
          {displayedJobs.length === 0 ? (
            <div className="queue-empty-state">
              <Sparkles size={32} className="empty-icon" />
              <p className="empty-title">Henüz baskı kaydı yok</p>
              <p className="empty-sub">
                Space veya Enter ile gönderilen baskılar anlık olarak burada listelenir.
              </p>
            </div>
          ) : (
            displayedJobs.map((job) => {
              const isBusy = job.status === 'printing' || job.status === 'queued';
              const mediaUrl = `media://${encodeURI(job.photoPath)}`;

              return (
                <div key={job.id} className={`queue-job-card ${job.status}`}>
                  <div className="job-thumbnail-wrapper">
                    <img src={mediaUrl} alt={job.photoName} className="job-thumbnail" />
                    {job.status === 'printing' && (
                      <div className="job-printing-overlay" title="Yazdırılıyor...">
                        <RefreshCw size={16} className="animate-spin" />
                      </div>
                    )}
                  </div>

                  <div className="job-details">
                    <div className="job-row-top">
                      <span className="job-name" title={job.photoName}>
                        {job.photoName}
                      </span>
                      <span className="job-time">
                        <Clock size={11} />
                        {formatTime(job.timestamp)}
                      </span>
                    </div>

                    <div className="job-meta-chips">
                      <span className="job-chip copies">{job.copies} Adet</span>
                      <span className="job-chip finish">
                        {job.finish === 'Glossy' ? 'Parlak' : 'Mat'}
                      </span>
                      <span className="job-chip size">6x8</span>

                      {job.cupsJobId && (
                        <span className="job-chip cups-id" title="CUPS İş Kimliği">
                          #{job.cupsJobId.split('-').pop()}
                        </span>
                      )}
                    </div>

                    {/* Durum Mesajı / Hata */}
                    {job.errorMessage && (
                      <div className="job-error-msg">
                        <AlertCircle size={12} />
                        <span>{job.errorMessage}</span>
                      </div>
                    )}

                    {/* Aksiyon Butonları */}
                    <div className="job-actions">
                      {isBusy ? (
                        <button
                          className="job-cancel-btn"
                          onClick={() => onCancelJob(job)}
                          title="Bu işi CUPS kuyruğundan iptal et"
                        >
                          <Ban size={12} />
                          <span>İptal Et</span>
                        </button>
                      ) : (
                        <div className="job-history-actions">
                          <span className={`status-pill ${job.status}`}>
                            {job.status === 'completed' && (
                              <>
                                <CheckCircle2 size={12} />
                                <span>Basıldı</span>
                              </>
                            )}
                            {job.status === 'cancelled' && (
                              <>
                                <Ban size={12} />
                                <span>İptal Edildi</span>
                              </>
                            )}
                            {job.status === 'failed' && (
                              <>
                                <AlertCircle size={12} />
                                <span>Başarısız</span>
                              </>
                            )}
                          </span>

                          <button
                            className="reprint-btn"
                            onClick={() => onReprintJob(job)}
                            title="Aynı kadraj ve ayarlarla bir adet daha bas"
                          >
                            <RefreshCw size={12} />
                            <span>Tekrar Bas</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Alt Footer - Geçmişi Temizle */}
        {historyJobs.length > 0 && (
          <div className="queue-footer">
            <button className="clear-history-btn" onClick={onClearHistory}>
              <Trash2 size={13} />
              <span>Geçmişi Temizle</span>
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
