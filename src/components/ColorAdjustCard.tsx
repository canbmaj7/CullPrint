import React from 'react';
import { SlidersHorizontal, RefreshCw } from 'lucide-react';
import { ADJUST_RANGE, isNeutralAdjust, type ColorAdjust } from '../utils/adjust';

const ADJUST_FIELDS: { key: keyof ColorAdjust; label: string }[] = [
  { key: 'brightness', label: 'Parlaklık' },
  { key: 'contrast', label: 'Kontrast' },
  { key: 'saturation', label: 'Doygunluk' },
  { key: 'temperature', label: 'Sıcaklık' },
];

interface ColorAdjustCardProps {
  adjust: ColorAdjust;
  disabled: boolean; // seçili fotoğraf yoksa
  onChange: (next: ColorAdjust) => void;
  onReset: () => void;
  onApplyToAll: () => void;
}

/** Renk ayarı kartı: YAZDIR düğmesinin hemen üstünde, seçili fotoğraf için (baskıya da yansır) */
export const ColorAdjustCard: React.FC<ColorAdjustCardProps> = ({ adjust, disabled, onChange, onReset, onApplyToAll }) => {
  const isNeutral = isNeutralAdjust(adjust);
  return (
    <div className="sidebar-card color-adjust-card">
      <div className="card-header">
        <div className="card-title-group">
          <SlidersHorizontal size={15} />
          <span className="card-title">Renk Ayarı</span>
        </div>
        <button
          type="button"
          className="adjust-reset-link"
          onClick={onReset}
          disabled={disabled || isNeutral}
          title="Bu fotoğrafın renk ayarını sıfırla"
        >
          <RefreshCw size={12} />
          Sıfırla
        </button>
      </div>

      {ADJUST_FIELDS.map(({ key, label }) => (
        <label key={key} className="adjust-row">
          <span className="adjust-label">{label}</span>
          <input
            type="range"
            min={-ADJUST_RANGE}
            max={ADJUST_RANGE}
            step={1}
            value={adjust[key]}
            disabled={disabled}
            onChange={(e) => onChange({ ...adjust, [key]: Number(e.target.value) })}
            // Çift tık: yalnızca bu ayarı sıfırla
            onDoubleClick={() => onChange({ ...adjust, [key]: 0 })}
            // Kaydırıcı odakta kalırsa Space/ok tuşları baskı ve gezinme yerine ona gider
            onPointerUp={(e) => e.currentTarget.blur()}
          />
          <span className="adjust-value">{adjust[key] > 0 ? `+${adjust[key]}` : adjust[key]}</span>
        </label>
      ))}

      <button
        type="button"
        className="adjust-apply-all"
        onClick={onApplyToAll}
        disabled={disabled}
        title="Bu ayarı listedeki tüm fotoğraflara kopyala"
      >
        Tümüne uygula
      </button>
    </div>
  );
};
