import React, { useRef, useEffect } from 'react';
import { Check } from 'lucide-react';
import { PhotoItem } from '../types';

interface FilmstripProps {
  photos: PhotoItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export const Filmstrip: React.FC<FilmstripProps> = ({
  photos,
  selectedIndex,
  onSelect,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Aktif fotoğraf değiştiğinde şeridi otomatik ortala
  useEffect(() => {
    if (!scrollRef.current) return;
    const activeEl = scrollRef.current.children[selectedIndex] as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  if (photos.length === 0) return null;

  return (
    <div className="filmstrip-container">
      <div className="filmstrip-scroll-area" ref={scrollRef}>
        {photos.map((photo, index) => {
          const isSelected = index === selectedIndex;
          const mediaSrc = `media://${encodeURI(photo.path)}`;

          return (
            <div
              key={photo.path}
              className={`filmstrip-item ${isSelected ? 'active' : ''} ${photo.printed ? 'printed' : ''}`}
              onClick={() => onSelect(index)}
              title={`${photo.name} ${photo.printed ? '(Basıldı)' : ''}`}
            >
              {/* Küçük Resim */}
              <div className="thumbnail-box">
                <img
                  src={mediaSrc}
                  alt={photo.name}
                  loading="lazy"
                  className="thumb-img"
                />

                {/* Basıldı Rozeti */}
                {photo.printed && (
                  <div className="thumb-printed-badge">
                    <Check size={11} strokeWidth={3} />
                  </div>
                )}

                {/* Sıra Numarası */}
                <div className="thumb-index-tag">{index + 1}</div>
              </div>

              {/* Dosya Adı */}
              <span className="thumb-name">{photo.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
