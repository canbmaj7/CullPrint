import React from 'react';
import { X } from 'lucide-react';

export interface PendingPrint {
  id: string;
  photoPath: string; // aynı kare iptal süresindeyken ikinci kez bekletilmesin
  photoName: string;
  delayMs: number;
}

interface PendingPrintBarProps {
  items: PendingPrint[];
  onCancel: (id: string) => void;
}

/** Baskıya basıldıktan sonra yazıcıya gitmeden önceki iptal süresi: ilerleme çubuğu ve İptal düğmesi (Esc) */
export const PendingPrintBar: React.FC<PendingPrintBarProps> = ({ items, onCancel }) => {
  if (items.length === 0) return null;
  return (
    <div className="pending-print-stack" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className="pending-print-item">
          <div className="pending-print-text">
            <span>Baskıya gönderiliyor</span>
            <b>{item.photoName}</b>
          </div>
          <button type="button" className="pending-cancel-btn" onClick={() => onCancel(item.id)}>
            <X size={13} />
            İptal (Esc)
          </button>
          <div className="pending-print-progress" style={{ animationDuration: `${item.delayMs}ms` }} />
        </div>
      ))}
    </div>
  );
};
