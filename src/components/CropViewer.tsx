import React, { useRef, useState, useEffect } from 'react';
import { RotateCw, Check, MoveVertical, MoveHorizontal, RefreshCw } from 'lucide-react';
import { PhotoItem } from '../types';
import { getCropAxis, getTargetRatio } from '../utils/crop';
import { formatPaperSize } from '../utils/media';

interface CropViewerProps {
  photo: PhotoItem | null;
  mediaSize: string; // seçili kâğıt: çerçeve oranı ve etiket buradan
  onRotate: () => void;
  onAdjustCrop: (deltaX: number, deltaY: number) => void;
  onResetCrop: () => void;
}

export const CropViewer: React.FC<CropViewerProps> = ({
  photo,
  mediaSize,
  onRotate,
  onAdjustCrop,
  onResetCrop,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // Yüklenen dosyanın yolunu tut: önbellekten anında gelen görselde onLoad, sıfırlama efektinden
  // önce tetiklenip görseli görünmez bırakabiliyordu
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const imgLoaded = loadedPath === photo?.path;

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

  // Mouse ile sürükleyerek kadraj kaydırma
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
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
        <div className="photo-meta-badge">
          <span className="file-name">{photo.name}</span>
          <span className="orientation-chip">
            {effectiveIsLandscape ? 'Yatay' : 'Dikey'} {formatPaperSize(mediaSize)}
          </span>
          {photo.width && photo.height && (
            <span className="dim-chip">{photo.width} × {photo.height}</span>
          )}
        </div>

        {photo.printed && (
          <div className="printed-badge-pulse">
            <Check size={14} />
            <span>✓ BASILDI ({photo.printCount}x)</span>
          </div>
        )}
      </div>

      {/* Ana Fotoğraf ve 6x8 Kırpma Alanı */}
      <div className="canvas-wrapper">
        <div
          className="aspect-box"
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
                objectFit: 'cover',
                objectPosition: `${posX}% ${posY}%`,
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
          {cropAxis === 'x' ? (
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

        <div className="control-btn-group">
          {(photo.cropOffsetX !== 0 || photo.cropOffsetY !== 0) && (
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
