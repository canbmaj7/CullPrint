import React, { useRef, useState, useEffect } from 'react';
import { RotateCw, Check, MoveVertical, MoveHorizontal, RefreshCw } from 'lucide-react';
import { PhotoItem } from '../types';

interface CropViewerProps {
  photo: PhotoItem | null;
  onRotate: () => void;
  onAdjustCrop: (deltaX: number, deltaY: number) => void;
  onResetCrop: () => void;
}

export const CropViewer: React.FC<CropViewerProps> = ({
  photo,
  onRotate,
  onAdjustCrop,
  onResetCrop,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // 6x8 inç kağıt oranı 4:3 (veya dikeyde 3:4)
  const targetRatio = effectiveIsLandscape ? 4 / 3 : 3 / 4;

  // Mouse ile sürükleyerek kadraj kaydırma
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    if (effectiveIsLandscape) {
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
            {effectiveIsLandscape ? 'Yatay 6x8 (15x20)' : 'Dikey 6x8 (15x20)'}
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
          style={{
            aspectRatio: `${targetRatio}`,
          }}
        >
          {/* Gerçek Fotoğraf Katmanı */}
          <div
            className="image-transform-container"
            style={{
              transform: `rotate(${totalRotation}deg)`,
            }}
          >
            <img
              src={mediaSrc}
              alt={photo.name}
              className="stage-photo"
              draggable={false}
              style={{
                objectFit: 'cover',
                // Kadraj kaydırma ofsetleri
                objectPosition: effectiveIsLandscape
                  ? `${50 + (photo.cropOffsetX || 0) / 2}% 50%`
                  : `50% ${50 + (photo.cropOffsetY || 0) / 2}%`,
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
          {effectiveIsLandscape ? (
            <>
              <MoveHorizontal size={14} />
              <span>Kadrajı kaydırmak için <b>Sağ/Sol</b> okları kullanın veya fareyle sürükleyin</span>
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
