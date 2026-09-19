import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
import { PhotoItem, FilterMode, PrinterState, ThemeMode, PrintJob, PrinterCapabilities, PrinterSettings } from './types';
import { generatePrintRaster } from './utils/rasterizer';
import { Header } from './components/Header';
import { CropViewer } from './components/CropViewer';
import { Filmstrip } from './components/Filmstrip';
import { PrinterSidebar } from './components/PrinterSidebar';
import { QueueDrawer } from './components/QueueDrawer';
import { SettingsModal } from './components/SettingsModal';
import { FileItem } from './vite-env';

export const App: React.FC = () => {
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const dragCounterRef = useRef<number>(0);
  const nextTargetPathRef = useRef<string | null>(null);

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

  // Baskı Kuyruğu ve Rulo Sayacı State'leri
  const [queue, setQueue] = useState<PrintJob[]>(() => {
    try {
      const saved = localStorage.getItem('cullprint_queue');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [rollPrintsCount, setRollPrintsCount] = useState<number>(() => {
    const saved = localStorage.getItem('cullprint_roll_prints');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('cullprint_queue', JSON.stringify(queue.slice(0, 100)));
    } catch {}
  }, [queue]);

  useEffect(() => {
    localStorage.setItem('cullprint_roll_prints', rollPrintsCount.toString());
  }, [rollPrintsCount]);

  // Yazıcı Ayarları
  const [printers, setPrinters] = useState<PrinterState[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [finish, setFinish] = useState<string>('Glossy');
  const [copies, setCopies] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [lastPrintStatus, setLastPrintStatus] = useState<{ success: boolean; message: string } | null>(null);

  const [printerCapabilities, setPrinterCapabilities] = useState<PrinterCapabilities | null>(null);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>({
    mediaSize: 'w432h576',
    finishOptionName: 'StpLaminate',
    finishValue: 'Glossy',
  });

  // Seçili yazıcıya göre kayıtlı ayarları yükle
  useEffect(() => {
    if (!selectedPrinter) return;
    const storageKey = `cullprint_printer_settings_${selectedPrinter.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed: PrinterSettings = JSON.parse(saved);
        setPrinterSettings(parsed);
        if (parsed.finishValue) {
          setFinish(parsed.finishValue);
        }
      } catch {
        setPrinterSettings({ mediaSize: 'w432h576', finishOptionName: 'StpLaminate', finishValue: 'Glossy' });
      }
    } else {
      setPrinterSettings({ mediaSize: 'w432h576', finishOptionName: 'StpLaminate', finishValue: 'Glossy' });
    }
  }, [selectedPrinter]);

  // Ayarlar modalı açıldığında yazıcı yeteneklerini sorgula
  useEffect(() => {
    if (!isSettingsOpen || !selectedPrinter || !window.electronAPI) return;

    if (!printerCapabilities || printerCapabilities.printerName !== selectedPrinter) {
      let isMounted = true;
      setIsLoadingCapabilities(true);
      window.electronAPI
        .getPrinterOptions(selectedPrinter)
        .then((caps) => {
          if (isMounted) {
            setPrinterCapabilities(caps);
          }
        })
        .catch((err) => {
          console.error('Yazıcı yetenekleri alınamadı:', err);
        })
        .finally(() => {
          if (isMounted) {
            setIsLoadingCapabilities(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }
  }, [isSettingsOpen, selectedPrinter, printerCapabilities]);

  const handleSaveSettings = useCallback(
    (settings: PrinterSettings) => {
      setPrinterSettings(settings);
      if (settings.finishValue) {
        setFinish(settings.finishValue);
      }
      if (selectedPrinter) {
        const storageKey = `cullprint_printer_settings_${selectedPrinter.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        localStorage.setItem(storageKey, JSON.stringify(settings));
      }
    },
    [selectedPrinter]
  );

  // CUPS'ta takılı kalan işin nedeni (ör. "Printer open failure"); yazıcı 'idle' görünse bile
  const [cupsJobProblem, setCupsJobProblem] = useState<string | null>(null);

  // CUPS Kuyruğunu Canlı İzle ve Tamamlanan İşleri Güncelle
  useEffect(() => {
    if (!window.electronAPI) return;
    const syncCupsQueue = async () => {
      try {
        const activeCupsJobs = await window.electronAPI!.getCupsQueue();
        const cupsJobsById = new Map(activeCupsJobs.map((j) => [j.id, j]));
        setCupsJobProblem(activeCupsJobs.find((j) => j.problem)?.problem ?? null);

        setQueue((prev) =>
          prev.map((job) => {
            if (job.cupsJobId && (job.status === 'printing' || job.status === 'queued')) {
              const cupsJob = cupsJobsById.get(job.cupsJobId);
              if (!cupsJob) {
                return { ...job, status: 'completed', errorMessage: undefined };
              }
              // CUPS'ta takılı kalan işin nedenini çekmecede göster, sorun geçince kaldır
              if (cupsJob.problem !== job.errorMessage) {
                return { ...job, errorMessage: cupsJob.problem };
              }
            }
            return job;
          })
        );
      } catch {
        // ignore
      }
    };

    const interval = setInterval(syncCupsQueue, 3000);
    return () => clearInterval(interval);
  }, []);

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

  // CUPS kuyruğunu duraklat / devam ettir
  const [isTogglingQueue, setIsTogglingQueue] = useState(false);
  const handleToggleQueue = useCallback(async () => {
    const printer = printers.find((p) => p.name === selectedPrinter);
    if (!window.electronAPI || !printer || isTogglingQueue) return;
    const enable = printer.status === 'disabled';
    setIsTogglingQueue(true);
    try {
      const res = await window.electronAPI.setPrinterEnabled(printer.name, enable);
      if (res.success) {
        setPrinters(await window.electronAPI.getPrinters());
      } else {
        setLastPrintStatus({
          success: false,
          message: `Kuyruk ${enable ? 'başlatılamadı' : 'duraklatılamadı'}: ${res.error || 'Bilinmeyen hata'}`,
        });
      }
    } finally {
      setIsTogglingQueue(false);
    }
  }, [printers, selectedPrinter, isTogglingQueue]);

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
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    if (!window.electronAPI || !e.dataTransfer.files) return;

    const files = Array.from(e.dataTransfer.files);
    const validExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
    const droppedFiles: FileItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
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

  // Baskı sonrası bir sonraki hedefe geçiş
  useEffect(() => {
    if (!nextTargetPathRef.current) return;
    const targetPath = nextTargetPathRef.current;
    nextTargetPathRef.current = null;
    const newIdx = filteredPhotos.findIndex((p) => p.path === targetPath);
    if (newIdx !== -1) {
      setSelectedIndex(newIdx);
    }
  }, [filteredPhotos]);

  // Seçili aktif fotoğraf
  const currentPhoto = filteredPhotos[selectedIndex] || null;

  // Komşu fotoğrafların 1600px önizlemesini önden çöz: ok tuşuyla geçiş anında olsun
  useEffect(() => {
    const neighbors = [selectedIndex + 1, selectedIndex - 1, selectedIndex + 2]
      .map((i) => filteredPhotos[i])
      .filter((p): p is PhotoItem => Boolean(p));
    const imgs = neighbors.map((p) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = `media-thumb://thumb?path=${encodeURIComponent(p.path)}&size=1600`;
      return img;
    });
    return () => {
      imgs.forEach((img) => {
        img.src = '';
      });
    };
  }, [selectedIndex, filteredPhotos]);

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

    // Hedef fotoğrafı belirle (mevcut fotoğraftan bir sonraki veya yoksa bir önceki)
    const targetPhoto = filteredPhotos[selectedIndex + 1] ?? filteredPhotos[selectedIndex - 1] ?? null;
    nextTargetPathRef.current = targetPhoto ? targetPhoto.path : null;

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      setIsPrinting(true);
      setLastPrintStatus(null);

      // Etkin yönü hesapla
      const isRotated90 = currentPhoto.userRotation === 90 || currentPhoto.userRotation === 270;
      const effectiveIsLandscape = isRotated90
        ? !currentPhoto.isLandscape
        : (currentPhoto.isLandscape ?? true);

      // 1. Tam çözünürlüklü raster üret
      // NEVER use media-thumb:// here — print raster must be generated from the full original file
      const mediaUrl = `media://${encodeURI(currentPhoto.path)}`;
      const effectiveFinish = printerSettings.finishValue || finish;
      const base64Raster = await generatePrintRaster({
        imageUrl: mediaUrl,
        isLandscape: effectiveIsLandscape,
        cropOffsetX: currentPhoto.cropOffsetX || 0,
        cropOffsetY: currentPhoto.cropOffsetY || 0,
        userRotation: currentPhoto.userRotation || 0,
        mediaSizeToken: printerSettings.mediaSize,
        dpi: 300,
      });

      // Kuyruğa 'printing' olarak ekle
      const newJob: PrintJob = {
        id: jobId,
        photoName: currentPhoto.name,
        photoPath: currentPhoto.path,
        copies,
        finish: effectiveFinish,
        mediaSize: printerSettings.mediaSize,
        timestamp: Date.now(),
        status: 'printing',
        cropOffsetX: currentPhoto.cropOffsetX || 0,
        cropOffsetY: currentPhoto.cropOffsetY || 0,
        userRotation: currentPhoto.userRotation || 0,
      };
      setQueue((prev) => [newJob, ...prev]);

      // 2. Geçici spool dosyasına kaydet
      const spoolPath = await window.electronAPI.saveTempPrintFile(base64Raster);

      // 3. CUPS üzerinden yazıcıya gönder
      const printResult = await window.electronAPI.executePrint({
        filePath: spoolPath,
        printerName: selectedPrinter,
        copies,
        mediaSize: printerSettings.mediaSize,
        finish: effectiveFinish,
        mediaOptionName: printerCapabilities?.mediaOptionName || undefined,
        finishOptionName: printerCapabilities?.finishOptionName || undefined,
      });

      if (printResult.success) {
        setRollPrintsCount((prev) => prev + copies);
        setQueue((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  cupsJobId: printResult.cupsJobId,
                  status: printResult.cupsJobId ? 'queued' : 'completed',
                }
              : j
          )
        );

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
          message: `${currentPhoto.name} (${copies}x ${effectiveFinish}) kuyruğa gönderildi.`,
        });
      } else {
        nextTargetPathRef.current = null;
        setQueue((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? { ...j, status: 'failed', errorMessage: printResult.error }
              : j
          )
        );
        setLastPrintStatus({
          success: false,
          message: `Yazdırma hatası: ${printResult.error || 'Bilinmeyen hata'}`,
        });
      }
    } catch (err) {
      nextTargetPathRef.current = null;
      console.error('Yazdırma işlemi başarısız:', err);
      setQueue((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, status: 'failed', errorMessage: 'Baskı hazırlığı sırasında hata oluştu' }
            : j
        )
      );
      setLastPrintStatus({
        success: false,
        message: 'Baskı hazırlığı sırasında hata oluştu.',
      });
    } finally {
      setIsPrinting(false);
    }
  }, [
    currentPhoto,
    isPrinting,
    selectedPrinter,
    copies,
    finish,
    printerSettings,
    printerCapabilities,
    selectedIndex,
    filteredPhotos,
  ]);

  // 4.5. Tekrar Bas (Reprint) - Kuyruk Çekmecesinden
  const handleReprintJob = useCallback(
    async (job: PrintJob) => {
      if (!window.electronAPI || isPrinting) return;

      const newJobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      try {
        setIsPrinting(true);
        setLastPrintStatus(null);

        const targetPhoto = photos.find((p) => p.path === job.photoPath);
        const isRotated90 = job.userRotation === 90 || job.userRotation === 270;
        const effectiveIsLandscape = isRotated90
          ? !(targetPhoto?.isLandscape ?? true)
          : (targetPhoto?.isLandscape ?? true);

        // NEVER use media-thumb:// here — print raster must be generated from the full original file
        const mediaUrl = `media://${encodeURI(job.photoPath)}`;
        const effectiveMediaSize = job.mediaSize || printerSettings.mediaSize;
        const effectiveFinish = job.finish || printerSettings.finishValue || finish;

        const base64Raster = await generatePrintRaster({
          imageUrl: mediaUrl,
          isLandscape: effectiveIsLandscape,
          cropOffsetX: job.cropOffsetX,
          cropOffsetY: job.cropOffsetY,
          userRotation: job.userRotation,
          mediaSizeToken: effectiveMediaSize,
          dpi: 300,
        });

        const newJob: PrintJob = {
          ...job,
          id: newJobId,
          timestamp: Date.now(),
          status: 'printing',
          cupsJobId: undefined,
          errorMessage: undefined,
        };
        setQueue((prev) => [newJob, ...prev]);

        const spoolPath = await window.electronAPI.saveTempPrintFile(base64Raster);
        const printResult = await window.electronAPI.executePrint({
          filePath: spoolPath,
          printerName: selectedPrinter,
          copies: job.copies,
          mediaSize: effectiveMediaSize,
          finish: effectiveFinish,
          mediaOptionName: printerCapabilities?.mediaOptionName || undefined,
          finishOptionName: printerCapabilities?.finishOptionName || undefined,
        });

        if (printResult.success) {
          setRollPrintsCount((prev) => prev + job.copies);
          setQueue((prev) =>
            prev.map((j) =>
              j.id === newJobId
                ? {
                    ...j,
                    cupsJobId: printResult.cupsJobId,
                    status: printResult.cupsJobId ? 'queued' : 'completed',
                  }
                : j
            )
          );
          setPhotos((prev) =>
            prev.map((p) =>
              p.path === job.photoPath
                ? { ...p, printed: true, printCount: (p.printCount || 0) + job.copies }
                : p
            )
          );
          setLastPrintStatus({
            success: true,
            message: `${job.photoName} (${job.copies}x ${effectiveFinish}) tekrar basıldı.`,
          });
        } else {
          setQueue((prev) =>
            prev.map((j) =>
              j.id === newJobId
                ? { ...j, status: 'failed', errorMessage: printResult.error }
                : j
            )
          );
          setLastPrintStatus({
            success: false,
            message: `Tekrar basma hatası: ${printResult.error || 'Bilinmeyen hata'}`,
          });
        }
      } catch (err) {
        console.error('Tekrar basma hatası:', err);
      } finally {
        setIsPrinting(false);
      }
    },
    [isPrinting, photos, selectedPrinter, printerSettings, printerCapabilities, finish]
  );

  // 4.6. Kuyruktaki İşi İptal Et
  // İptali süren işler: CUPS yanıtı gelene kadar butonu kilitler (çift tıklamayı önler)
  const [cancellingJobIds, setCancellingJobIds] = useState<Set<string>>(() => new Set());

  const handleCancelJob = useCallback(async (job: PrintJob) => {
    if (!window.electronAPI) return;
    if (!job.cupsJobId) {
      setLastPrintStatus({
        success: false,
        message: 'Bu iş henüz CUPS kuyruğuna ulaşmadı, birkaç saniye sonra tekrar deneyin.',
      });
      return;
    }

    setCancellingJobIds((prev) => new Set(prev).add(job.id));
    try {
      const res = await window.electronAPI.cancelPrintJob(job.cupsJobId);
      if (res.success) {
        setQueue((prev) =>
          prev.map((j) =>
            j.id === job.id ? { ...j, status: 'cancelled' } : j
          )
        );
      } else {
        setLastPrintStatus({
          success: false,
          message: `İş iptal edilemedi: ${res.error || 'Bilinmeyen hata'}`,
        });
      }
    } catch (err) {
      console.error('İş iptal edilemedi:', err);
    } finally {
      setCancellingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  }, []);

  const handleClearHistory = useCallback(() => {
    setQueue((prev) => prev.filter((j) => j.status === 'printing' || j.status === 'queued'));
  }, []);

  const handleResetRoll = useCallback(() => {
    setRollPrintsCount(0);
  }, []);

  // 5. Global Klavye Kısayolları
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
        return;
      }

      if ((isQueueOpen || isSettingsOpen) && e.key !== 'Escape' && e.key !== 'q' && e.key !== 'Q') {
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

        case 'q':
        case 'Q':
          e.preventDefault();
          setIsQueueOpen((prev) => !prev);
          break;

        case 'Escape':
          if (isSettingsOpen) {
            e.preventDefault();
            setIsSettingsOpen(false);
            break;
          }
          if (isQueueOpen) {
            e.preventDefault();
            setIsQueueOpen(false);
            break;
          }
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
  }, [
    handlePrintAndNext,
    handleAdjustCrop,
    handleRotate,
    handleResetCrop,
    filteredPhotos.length,
    isQueueOpen,
    isSettingsOpen,
  ]);

  // İstatistikler
  const printedCount = useMemo(() => photos.filter((p) => p.printed).length, [photos]);
  const unprintedCount = photos.length - printedCount;
  const activeJobCount = useMemo(
    () => queue.filter((j) => j.status === 'printing' || j.status === 'queued').length,
    [queue]
  );

  return (
    <div
      className="app-shell"
      onDragEnter={handleDragEnter}
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
        queueCount={queue.length}
        activeJobCount={activeJobCount}
        activePrinterName={selectedPrinter || null}
        activePrinterIsDNP={Boolean(printers.find((p) => p.name === selectedPrinter)?.isDNP)}
        onSelectFolder={handleSelectFolder}
        onSelectFiles={handleSelectFiles}
        onToggleTheme={toggleTheme}
        onFilterChange={(mode) => {
          setFilterMode(mode);
          setSelectedIndex(0);
        }}
        onToggleQueue={() => setIsQueueOpen((prev) => !prev)}
        onOpenSettings={() => setIsSettingsOpen(true)}
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
          finish={printerSettings.finishValue || finish}
          onChangeFinish={(val) => {
            setFinish(val);
            setPrinterSettings((prev) => ({ ...prev, finishValue: val }));
          }}
          copies={copies}
          onChangeCopies={setCopies}
          isPrinting={isPrinting}
          onPrint={handlePrintAndNext}
          hasPhoto={Boolean(currentPhoto)}
          lastPrintStatus={lastPrintStatus}
          currentSettings={printerSettings}
          capabilities={printerCapabilities}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onToggleQueue={handleToggleQueue}
          cupsJobProblem={cupsJobProblem}
          isTogglingQueue={isTogglingQueue}
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

      {/* Baskı Kuyruğu Çekmecesi (Slide-Over Drawer) */}
      <QueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        queue={queue}
        onCancelJob={handleCancelJob}
        cancellingJobIds={cancellingJobIds}
        onReprintJob={handleReprintJob}
        onClearHistory={handleClearHistory}
        rollPrintsCount={rollPrintsCount}
        onResetRoll={handleResetRoll}
        rollCapacity={200}
      />

      {/* Yazıcı Ayarları Modalı */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        printerName={selectedPrinter}
        capabilities={printerCapabilities}
        isLoadingCapabilities={isLoadingCapabilities}
        currentSettings={printerSettings}
        onSave={handleSaveSettings}
      />
    </div>
  );
};
