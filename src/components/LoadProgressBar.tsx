import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadProgress {
  done: number;
  total: number;
  label: string;
}

/** Klasör/dosya yüklenirken ilerleme çubuğu; toplam henüz bilinmiyorsa (0) belirsiz animasyon */
export const LoadProgressBar: React.FC<{ progress: LoadProgress | null }> = ({ progress }) => {
  if (!progress) return null;
  const known = progress.total > 0;
  const percent = known ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;
  return (
    <div className="load-progress-card" role="status" aria-live="polite">
      <div className="load-progress-head">
        <Loader2 size={15} className="animate-spin" />
        <span>{progress.label}</span>
        <b>{known ? `${progress.done} / ${progress.total}` : '...'}</b>
      </div>
      <div className="load-progress-track">
        <div
          className={`load-progress-fill ${known ? '' : 'is-indeterminate'}`}
          style={known ? { width: `${percent}%` } : undefined}
        />
      </div>
    </div>
  );
};
