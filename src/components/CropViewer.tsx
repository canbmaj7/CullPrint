import React, { useRef, useState, useEffect } from 'react';
import { RotateCw, Check, MoveVertical, MoveHorizontal, RefreshCw, Maximize, Crop, SlidersHorizontal } from 'lucide-react';
import { FitMode, PhotoItem } from '../types';
import { getCropAxis, getTargetRatio } from '../utils/crop';
import { formatPaperSize } from '../utils/media';
import { formatShot } from '../utils/shot';
import {
  ADJUST_RANGE,
  buildColorTransform,
  isNeutralAdjust,
  NEUTRAL_ADJUST,
  toSvgColorMatrix,
  type ColorAdjust,
} from '../utils/adjust';

// Ayar kaydırıcıları: etiket ve sıra
const ADJUST_FIELDS: { key: keyof ColorAdjust; label: string }[] = [
  { key: 'brightness', label: 'Parlaklık' },
  { key: 'contrast', label: 'Kontrast' },
  { key: 'saturation', label: 'Doygunluk' },
  { key: 'temperature', label: 'Sıcaklık' },
];

interface CropViewerProps {
  photo: PhotoItem | null;
  mediaSize: string; // seçili kâğıt: çerçeve oranı ve etiket buradan
  fitMode: FitMode; // bu fotoğrafın etkin kadraj modu (kendi seçimi ya da Ayarlar varsayılanı)
  onRotate: () => void;
  onAdjustCrop: (deltaX: number, deltaY: number) => void;
  onResetCrop: () => void;
  onToggleFit: () => void;
  onAdjustChange: (next: ColorAdjust) => void;
  onResetAdjust: () => void;
  onApplyAdjustToAll: () => void;
}

export const CropViewer: React.FC<CropViewerProps> = ({
  photo,
  mediaSize,
  fitMode,
  onRotate,
  onAdjustCrop,
  onResetCrop,
  onToggleFit,
  onAdjustChange,
  onResetAdjust,
  onApplyAdjustToAll,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // Yüklenen dosyanın yolunu tut: önbellekten anında gelen görselde onLoad, sıfırlama efektinden
  // önce tetiklenip görseli görünmez bırakabiliyordu
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const imgLoaded = loadedPath === photo?.path;
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  if (!photo) {
    return (
      <div className="viewer-empty-state">
        <div className="empty-message">
          <p className="empty-title">Fotoğraf Seçilmedi</p>
          <p className="empty-desc">Fotoğrafları görüntülemek için üst kısımdan bir klasör veya SD kart seçin.</p>
        </div>
      </div>
    );
  }

  // URL oluşturma (Electron custom media protocol / proxy cache)
  const mediaSrc = `media-thumb://thumb?path=${encodeURIComponent(photo.path)}&size=1600`;

  // Manuel döndürme ve doğal EXIF yönü hesabı
  const totalRotation = (photo.userRotation || 0) % 360;
  const isRotated90 = totalRotation === 90 || totalRotation === 270;
  // Eğer 90 derece döndürüldüyse görselin etkin yatay/dikey durumu tersine döner
  const effectiveIsLandscape = isRotated90 ? !photo.isLandscape : (photo.isLandscape ?? true);

  // Seçili kâğıdın oranı (6x8 → 4:3, 4x6 → 3:2); baskı raster'ı da aynı oranla kırpılır
  const targetRatio = getTargetRatio(effectiveIsLandscape, mediaSize);

  // Sığdırma modunda kırpma yok: kadraj kaydırma, ofsetler ve kesim ipuçları devre dışı
  const isFit = fitMode === 'fit';

  // Döndürme sonrası görselin oranı: kağıttan genişse yanlardan, uzunsa üst/alttan kırpılır
  // (computeCropRect ile aynı kural)
  const cropAxis = getCropAxis(photo, mediaSize);

  // Döndürülmüş karede tanımlı kadraj ofsetlerini, döndürülmemiş <img> üzerindeki
  // object-position'a çevir (rasterizer'daki canvas döndürmesinin tersi)
  const ox = (photo.cropOffsetX || 0) / 2;
  const oy = (photo.cropOffsetY || 0) / 2;
  const [posX, posY] =
    totalRotation === 90
      ? [50 + oy, 50 - ox]
      : totalRotation === 180
        ? [50 - ox, 50 - oy]
        : totalRotation === 270
          ? [50 - oy, 50 + ox]
          : [50 + ox, 50 + oy];

  // Renk ayarı: önizleme baskıyla aynı matrisi (utils/adjust.ts) SVG filtresiyle uygular
  const adjust = photo.adjust ?? NEUTRAL_ADJUST;
  const hasAdjust = !isNeutralAdjust(adjust);
  const adjustMatrix = hasAdjust ? toSvgColorMatrix(buildColorTransform(adjust)) : '';

  const shotText = formatShot(photo.shot);

  // Mouse ile sürükleyerek kadraj kaydırma
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isFit) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || isFit) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    if (cropAxis === 'x') {
      if (Math.abs(deltaX) > 2) {
        onAdjustCrop(deltaX > 0 ? 3 : -3, 0);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    } else {
      if (Math.abs(deltaY) > 2) {
        onAdjustCrop(0, deltaY > 0 ? 3 : -3);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div
      className="crop-viewer-container"
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Üst Bilgi Rozetleri */}
      <div className="viewer-top-bar">
        <div className="photo-meta-stack">
        <div className="photo-meta-badge">
          <span className="file-name">{photo.name}</span>
          <span className="orientation-chip">
            {effectiveIsLandscape ? 'Yatay' : 'Dikey'} {formatPaperSize(mediaSize)}
          </span>
          {photo.width && photo.height && (
            <span className="dim-chip">{photo.width} × {photo.height}</span>
          )}
          {isFit && <span className="fit-chip" title="Fotoğrafın tamamı basılır, kenarlarda beyaz boşluk kalır">SIĞDIR</span>}
          {hasAdjust && <span className="fit-chip" title="Bu fotoğrafa renk ayarı uygulandı; baskıya da yansır">RENK</span>}
        </div>
        {(shotText.dateTime || shotText.camera || shotText.exposure) && (
          <div className="photo-shot-info">
            {shotText.dateTime && <span title="Çekim tarihi ve saati">{shotText.dateTime}</span>}
            {shotText.camera && <span title={shotText.lens ? `${shotText.camera} · ${shotText.lens}` : shotText.camera}>{shotText.camera}</span>}
            {shotText.exposure && <span title="Pozlama: enstantane · diyafram · ISO · odak uzaklığı">{shotText.exposure}</span>}
          </div>
        )}
        </div>

        {photo.printed && (
          <div className="printed-badge-pulse">
            <Check size={14} />
            <span>✓ BASILDI ({photo.printCount}x)</span>
          </div>
        )}
      </div>

      {hasAdjust && (
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <filter id="cp-color-adjust" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={adjustMatrix} />
          </filter>
        </svg>
      )}

      {/* Ana Fotoğraf ve 6x8 Kırpma Alanı */}
      <div className="canvas-wrapper">
        <div
          className={`aspect-box ${isFit ? 'is-fit' : ''}`}
          style={
            {
              aspectRatio: `${targetRatio}`,
              '--target-ratio': targetRatio,
            } as React.CSSProperties
          }
        >
          {/* Gerçek Fotoğraf Katmanı */}
          <div className="image-transform-container">
            <img
              src={mediaSrc}
              alt={photo.name}
              className={`stage-photo ${!imgLoaded ? 'is-loading' : ''}`}
              onLoad={() => setLoadedPath(photo.path)}
              draggable={false}
              style={{
                // 90/270°'de <img> kutunun en/boyu yer değiştirmiş haliyle çizilip döndürülür;
                // böylece döndürme sonrası kutuyu tam kaplar
                width: isRotated90 ? `${100 / targetRatio}%` : '100%',
                height: isRotated90 ? `${100 * targetRatio}%` : '100%',
                transform: `translate(-50%, -50%) rotate(${totalRotation}deg)`,
                // Sığdırmada görselin tamamı kutuya girer (kırpma yok), doldurmada kutuyu kaplar
                objectFit: isFit ? 'contain' : 'cover',
                objectPosition: isFit ? '50% 50%' : `${posX}% ${posY}%`,
                filter: hasAdjust ? 'url(#cp-color-adjust)' : undefined,
              }}
            />
          </div>

          {/* 6x8 Çerçeve Sınır Kılavuzu */}
          <div className="crop-guideline-overlay">
            <div className="guide-center-mark" />
          </div>
        </div>
      </div>

      {/* Alt Hızlı Kontroller (Döndür / Kadraj Kaydır) */}
      <div className="viewer-bottom-controls">
        <div className="crop-tip-pill">
          {isFit ? (
            <>
              <Maximize size={14} />
              <span>Fotoğrafın <b>tamamı</b> basılır; kenarlarda beyaz boşluk kalır. Kırpmak için <b>F</b></span>
            </>
          ) : cropAxis === 'x' ? (
            <>
              <MoveHorizontal size={14} />
              <span>Kadrajı sola/sağa kaydırmak için <b>Yukarı/Aşağı</b> okları kullanın veya fareyle sürükleyin</span>
            </>
          ) : (
            <>
              <MoveVertical size={14} />
              <span>Gelin tacı/damat kafasını kurtarmak için <b>Yukarı/Aşağı</b> okları kullanın</span>
            </>
          )}
        </div>

        {isAdjustOpen && (
          <div
            className="adjust-panel"
            // Panel üzerindeki fare hareketi kadraj sürüklemesini başlatmasın
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
          >
            <div className="adjust-panel-title">Renk ayarı <span>(bu fotoğraf)</span></div>
            {ADJUST_FIELDS.map(({ key, label }) => (
              <label key={key} className="adjust-row">
                <span className="adjust-label">{label}</span>
                <input
                  type="range"
                  min={-ADJUST_RANGE}
                  max={ADJUST_RANGE}
                  step={1}
                  value={adjust[key]}
                  onChange={(e) => onAdjustChange({ ...adjust, [key]: Number(e.target.value) })}
                  // Çift tık: yalnızca bu ayarı sıfırla
                  onDoubleClick={() => onAdjustChange({ ...adjust, [key]: 0 })}
                  // Kaydırıcı odakta kalırsa Space/ok tuşları baskı ve gezinme yerine ona gider
                  onPointerUp={(e) => e.currentTarget.blur()}
                />
                <span className="adjust-value">{adjust[key] > 0 ? `+${adjust[key]}` : adjust[key]}</span>
              </label>
            ))}
            <div className="adjust-actions">
              <button className="action-btn text-btn" onClick={onResetAdjust} disabled={!hasAdjust}>
                <RefreshCw size={13} />
                Sıfırla
              </button>
              <button
                className="action-btn"
                onClick={onApplyAdjustToAll}
                title="Bu ayarı listedeki tüm fotoğraflara kopyala"
              >
                Tümüne uygula
              </button>
            </div>
          </div>
        )}

        <div className="control-btn-group">
          <button
            className={`action-btn ${isAdjustOpen || hasAdjust ? 'active' : ''}`}
            onClick={(e) => {
              setIsAdjustOpen((open) => !open);
              e.currentTarget.blur();
            }}
            title="Renk ayarı: parlaklık, kontrast, doygunluk, sıcaklık"
          >
            <SlidersHorizontal size={14} />
            <span>Renk</span>
          </button>

          <button
            className={`action-btn ${isFit ? 'active' : ''}`}
            onClick={onToggleFit}
            title={
              isFit
                ? 'Kâğıdı doldur: kenarlardan kırparak kâğıdı tamamen doldur (F)'
                : 'Sayfaya sığdır: fotoğrafın tamamı bassın, kenarlarda beyaz boşluk kalsın (F)'
            }
          >
            {isFit ? <Crop size={14} /> : <Maximize size={14} />}
            <span>{isFit ? 'Kırp (F)' : 'Sığdır (F)'}</span>
          </button>

          {!isFit && (photo.cropOffsetX !== 0 || photo.cropOffsetY !== 0) && (
            <button
              className="action-btn text-btn"
              onClick={onResetCrop}
              title="Kadrajı Merkeze Sıfırla (C)"
            >
              <RefreshCw size={13} />
              Sıfırla (C)
            </button>
          )}

          <button
            className="action-btn"
            onClick={onRotate}
            title="90° Saat Yönünde Çevir (R)"
          >
            <RotateCw size={14} />
            <span>90° Çevir (R)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
