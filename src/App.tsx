import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PhotoItem, FilterMode, PrinterState } from './types';
import { getPhotoMetadata } from './utils/exif';
import { generatePrintRaster } from './utils/rasterizer';
import { Header } from './components/Header';
import { CropViewer } from './components/CropViewer';
import { Filmstrip } from './components/Filmstrip';
import { PrinterSidebar } from './components/PrinterSidebar';

export const App: React.FC = () => {
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  // Yazıcı Ayarları
  const [printers, setPrinters] = useState<PrinterState[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [finish, setFinish] = useState<'Glossy' | 'Matte'>('Glossy');
  const [copies, setCopies] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [lastPrintStatus, setLastPrintStatus] = useState<{ success: boolean; message: string } | null>(null);

  // 1. Sistemdeki Yazıcıları Yükle
  useEffect(() => {
    async function loadPrinters() {
      if (!window.electronAPI) return;
      try {
        const list = await window.electronAPI.getPrinters();
        setPrinters(list);

        // DNP DS620 varsa öncelikli seç
        const dnp = list.find((p) => p.isDNP);
        if (dnp) {
          setSelectedPrinter(dnp.name);
        } else if (list.length > 0) {
          const def = list.find((p) => p.isDefault) || list[0];
          setSelectedPrinter(def.name);
        }
      } catch (err) {
        console.error('Yazıcılar yüklenirken hata:', err);
      }
    }
    loadPrinters();
  }, []);

  // 2. Klasör Seçimi ve Fotoğrafları Yükleme
  const handleSelectFolder = async () => {
    if (!window.electronAPI) return;
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (!folderPath) return;

      setCurrentFolder(folderPath);
      const files = await window.electronAPI.readFolder(folderPath);

      // Temel liste
      const initialPhotos: PhotoItem[] = files.map((file) => ({
        ...file,
        printed: false,
        printCount: 0,
        cropOffsetX: 0,
        cropOffsetY: 0,
        userRotation: 0,
      }));

      setPhotos(initialPhotos);
      setSelectedIndex(0);

      // EXIF metadata bilgilerini arka planda asenkron zenginleştir
      initialPhotos.forEach(async (photo, idx) => {
        const mediaUrl = `media://${encodeURI(photo.path)}`;
        const meta = await getPhotoMetadata(mediaUrl);
        setPhotos((prev) =>
          prev.map((p, i) =>
            i === idx
              ? {
                  ...p,
                  orientation: meta.orientation,
                  width: meta.width,
                  height: meta.height,
                  isLandscape: meta.isLandscape,
                }
              : p
          )
        );
      });
    } catch (err) {
      console.error('Klasör açma hatası:', err);
    }
  };

  // Filtrelenmiş Fotoğraf Listesi
  const filteredPhotos = useMemo(() => {
    if (filterMode === 'printed') return photos.filter((p) => p.printed);
    if (filterMode === 'unprinted') return photos.filter((p) => !p.printed);
    return photos;
  }, [photos, filterMode]);

  // Seçili aktif fotoğraf
  const currentPhoto = filteredPhotos[selectedIndex] || null;

  // 3. Döndürme ve Kadraj Ayarları
  const handleRotate = useCallback(() => {
    if (!currentPhoto) return;
    setPhotos((prev) =>
      prev.map((p) =>
        p.path === currentPhoto.path
          ? { ...p, userRotation: ((p.userRotation || 0) + 90) % 360 }
          : p
      )
    );
  }, [currentPhoto]);

  const handleAdjustCrop = useCallback((deltaX: number, deltaY: number) => {
    if (!currentPhoto) return;
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.path !== currentPhoto.path) return p;
        const newX = Math.max(-100, Math.min(100, (p.cropOffsetX || 0) + deltaX));
        const newY = Math.max(-100, Math.min(100, (p.cropOffsetY || 0) + deltaY));
        return { ...p, cropOffsetX: newX, cropOffsetY: newY };
      })
    );
  }, [currentPhoto]);

  const handleResetCrop = useCallback(() => {
    if (!currentPhoto) return;
    setPhotos((prev) =>
      prev.map((p) =>
        p.path === currentPhoto.path
          ? { ...p, cropOffsetX: 0, cropOffsetY: 0 }
          : p
      )
    );
  }, [currentPhoto]);

  // 4. Yazdırma ve Sonrakine Geçme (Baskı Motoru)
  const handlePrintAndNext = useCallback(async () => {
    if (!currentPhoto || !window.electronAPI || isPrinting) return;

    try {
      setIsPrinting(true);
      setLastPrintStatus(null);

      // Etkin yönü hesapla
      const isRotated90 = currentPhoto.userRotation === 90 || currentPhoto.userRotation === 270;
      const effectiveIsLandscape = isRotated90
        ? !currentPhoto.isLandscape
        : (currentPhoto.isLandscape ?? true);

      // 1. Tam 1800x2400 piksel 300 DPI raster üret
      const mediaUrl = `media://${encodeURI(currentPhoto.path)}`;
      const base64Raster = await generatePrintRaster({
        imageUrl: mediaUrl,
        isLandscape: effectiveIsLandscape,
        cropOffsetX: currentPhoto.cropOffsetX || 0,
        cropOffsetY: currentPhoto.cropOffsetY || 0,
        userRotation: currentPhoto.userRotation || 0,
      });

      // 2. Geçici spool dosyasına kaydet
      const spoolPath = await window.electronAPI.saveTempPrintFile(base64Raster);

      // 3. CUPS üzerinden yazıcıya gönder
      const printResult = await window.electronAPI.executePrint({
        filePath: spoolPath,
        printerName: selectedPrinter,
        copies,
        mediaSize: 'w432h576', // 6x8 inç
        finish,
      });

      if (printResult.success) {
        // Durumu güncelle: Basıldı rozeti
        setPhotos((prev) =>
          prev.map((p) =>
            p.path === currentPhoto.path
              ? { ...p, printed: true, printCount: (p.printCount || 0) + copies }
              : p
          )
        );

        setLastPrintStatus({
          success: true,
          message: `${currentPhoto.name} (${copies}x ${finish}) kuyruğa gönderildi.`,
        });

        // 4. Otomatik bir sonraki fotoğrafa geç
        if (selectedIndex < filteredPhotos.length - 1) {
          setSelectedIndex((prev) => prev + 1);
        }
      } else {
        setLastPrintStatus({
          success: false,
          message: `Yazdırma hatası: ${printResult.error || 'Bilinmeyen hata'}`,
        });
      }
    } catch (err) {
      console.error('Yazdırma işlemi başarısız:', err);
      setLastPrintStatus({
        success: false,
        message: 'Baskı hazırlığı sırasında hata oluştu.',
      });
    } finally {
      setIsPrinting(false);
    }
  }, [currentPhoto, isPrinting, selectedPrinter, copies, finish, selectedIndex, filteredPhotos.length]);

  // 5. Global Klavye Kısayolları
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Eğer bir input veya select odağındaysa kısayolları engelle
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          handlePrintAndNext();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(0, prev - 1));
          break;

        case 'ArrowRight':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(filteredPhotos.length - 1, prev + 1));
          break;

        case 'ArrowUp':
          e.preventDefault();
          handleAdjustCrop(0, -5); // Kafa kurtar
          break;

        case 'ArrowDown':
          e.preventDefault();
          handleAdjustCrop(0, 5);  // Ayak kurtar
          break;

        case 'r':
        case 'R':
          e.preventDefault();
          handleRotate();
          break;

        case 'c':
        case 'C':
          e.preventDefault();
          handleResetCrop();
          break;

        // Rakam tuşları ile doğrudan kopya seçimi
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          setCopies(parseInt(e.key, 10));
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrintAndNext, handleAdjustCrop, handleRotate, handleResetCrop, filteredPhotos.length]);

  // İstatistikler
  const printedCount = useMemo(() => photos.filter((p) => p.printed).length, [photos]);
  const unprintedCount = photos.length - printedCount;

  return (
    <div className="app-shell">
      {/* Üst Bar */}
      <Header
        currentFolder={currentFolder}
        totalCount={photos.length}
        printedCount={printedCount}
        unprintedCount={unprintedCount}
        filterMode={filterMode}
        onSelectFolder={handleSelectFolder}
        onFilterChange={(mode) => {
          setFilterMode(mode);
          setSelectedIndex(0);
        }}
      />

      {/* Ana Gövde (Orta Kadraj + Sağ Yazıcı Paneli) */}
      <div className="app-main-layout">
        <main className="stage-area">
          <CropViewer
            photo={currentPhoto}
            onRotate={handleRotate}
            onAdjustCrop={handleAdjustCrop}
            onResetCrop={handleResetCrop}
          />
        </main>

        <PrinterSidebar
          printers={printers}
          selectedPrinter={selectedPrinter}
          onSelectPrinter={setSelectedPrinter}
          finish={finish}
          onChangeFinish={setFinish}
          copies={copies}
          onChangeCopies={setCopies}
          isPrinting={isPrinting}
          onPrint={handlePrintAndNext}
          hasPhoto={Boolean(currentPhoto)}
          lastPrintStatus={lastPrintStatus}
        />
      </div>

      {/* Alt Şerit (Küçük Resim Galerisi) */}
      <footer className="app-footer">
        <Filmstrip
          photos={filteredPhotos}
          selectedIndex={selectedIndex}
          onSelect={(idx) => setSelectedIndex(idx)}
        />
      </footer>
    </div>
  );
};
