import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { UploadCloud } from 'lucide-react';
import { PhotoItem, FilterMode, PrinterState, ThemeMode } from './types';
import { generatePrintRaster } from './utils/rasterizer';
import { Header } from './components/Header';
import { CropViewer } from './components/CropViewer';
import { Filmstrip } from './components/Filmstrip';
import { PrinterSidebar } from './components/PrinterSidebar';
import { FileItem } from './vite-env';

export const App: React.FC = () => {
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Tema Yönetimi (Dark / Light / Neutral)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('cullprint_theme') as ThemeMode) || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cullprint_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      if (prev === 'dark') return 'light';
      if (prev === 'light') return 'neutral';
      return 'dark';
    });
  };

  // Yazıcı Ayarları
  const [printers, setPrinters] = useState<PrinterState[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [finish, setFinish] = useState<'Glossy' | 'Matte'>('Glossy');
  const [copies, setCopies] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [lastPrintStatus, setLastPrintStatus] = useState<{ success: boolean; message: string } | null>(null);

  // 1. Sistemdeki Yazıcıları Yükle ve USB Takılmasını Canlı İzle
  useEffect(() => {
    async function loadPrinters() {
      if (!window.electronAPI) return;
      try {
        const list = await window.electronAPI.getPrinters();
        setPrinters(list);

        // DNP DS620 varsa öncelikli seç
        if (!selectedPrinter) {
          const dnp = list.find((p) => p.isDNP);
          if (dnp) {
            setSelectedPrinter(dnp.name);
          } else if (list.length > 0) {
            const def = list.find((p) => p.isDefault) || list[0];
            setSelectedPrinter(def.name);
          }
        }
      } catch (err) {
        console.error('Yazıcılar yüklenirken hata:', err);
      }
    }

    loadPrinters();
    // USB takılıp çıkarıldığında canlı algılamak için her 4 saniyede bir kontrol et
    const interval = setInterval(loadPrinters, 4000);
    return () => clearInterval(interval);
  }, [selectedPrinter]);

  // Yardımcı: Fotoğraf listesini güncelleme
  const addFilesToPhotos = useCallback((newFiles: FileItem[], isAppend = false) => {
    const newPhotos: PhotoItem[] = newFiles.map((file) => ({
      ...file,
      printed: false,
      printCount: 0,
      cropOffsetX: 0,
      cropOffsetY: 0,
      userRotation: 0,
      orientation: file.orientation ?? 1,
      width: file.width || 6000,
      height: file.height || 4000,
      isLandscape: file.isLandscape ?? ((file.width || 6000) >= (file.height || 4000)),
    }));

    setPhotos((prev) => {
      const merged = isAppend ? [...prev, ...newPhotos] : newPhotos;
      const seen = new Set<string>();
      return merged.filter((p) => {
        if (seen.has(p.path)) return false;
        seen.add(p.path);
        return true;
      });
    });

    if (!isAppend) {
      setSelectedIndex(0);
    }
  }, []);

  // 2. Klasör Seçimi
  const handleSelectFolder = async () => {
    if (!window.electronAPI) return;
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (!folderPath) return;

      setCurrentFolder(folderPath);
      const files = await window.electronAPI.readFolder(folderPath);
      addFilesToPhotos(files, false);
    } catch (err) {
      console.error('Klasör açma hatası:', err);
    }
  };

  // 2.5 Doğrudan Fotoğraf(lar) Ekleme
  const handleSelectFiles = async () => {
    if (!window.electronAPI) return;
    try {
      const files = await window.electronAPI.selectFiles();
      if (!files || files.length === 0) return;
      addFilesToPhotos(files, true);
    } catch (err) {
      console.error('Fotoğraf seçme hatası:', err);
    }
  };

  // 2.6 Drag & Drop (Sürükle - Bırak)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Eğer pencere dışına çıkıldıysa kapat
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!window.electronAPI || !e.dataTransfer.files) return;

    const validExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
    const droppedFiles: FileItem[] = [];

    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      const fullPath = window.electronAPI.getFilePath(file);
      if (fullPath) {
        const ext = fullPath.substring(fullPath.lastIndexOf('.')).toLowerCase();
        if (validExtensions.has(ext)) {
          const info = await window.electronAPI.getFileInfo(fullPath);
          if (info) {
            droppedFiles.push(info);
          } else {
            droppedFiles.push({
              name: file.name,
              path: fullPath,
              size: file.size,
              lastModified: file.lastModified,
            });
          }
        }
      }
    }

    if (droppedFiles.length > 0) {
      addFilesToPhotos(droppedFiles, true);
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
    <div
      className="app-shell"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Sürükle - Bırak Tam Ekran Katmanı */}
      {isDragOver && (
        <div className="drag-drop-overlay">
          <UploadCloud size={64} className="drag-drop-icon" />
          <span className="drag-drop-title">Fotoğrafları Buraya Bırakın</span>
          <span className="drag-drop-subtitle">Tek veya çoklu fotoğraflar anında listeye eklenecek</span>
        </div>
      )}

      {/* Üst Bar */}
      <Header
        currentFolder={currentFolder}
        totalCount={photos.length}
        printedCount={printedCount}
        unprintedCount={unprintedCount}
        filterMode={filterMode}
        theme={theme}
        onSelectFolder={handleSelectFolder}
        onSelectFiles={handleSelectFiles}
        onToggleTheme={toggleTheme}
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
