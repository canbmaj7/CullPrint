import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
import { PhotoItem, FilterMode, PrinterState, ThemeMode, PrintJob, PrinterCapabilities, PrinterSettings, FitMode } from './types';
import { createPrintFile } from './utils/rasterizer';
import { getCropAxis, getFitMode } from './utils/crop';
import { finishDisplayName } from './utils/finish';
import { defaultRollCapacity, formatPaperSize } from './utils/media';
import { Header } from './components/Header';
import { CropViewer } from './components/CropViewer';
import { Filmstrip } from './components/Filmstrip';
import { PrinterSidebar } from './components/PrinterSidebar';
import { QueueDrawer } from './components/QueueDrawer';
import { SettingsModal } from './components/SettingsModal';
import { FileItem } from './vite-env';

// Fotoğraf başına basılan kopya sayısı kalıcıdır: uygulama kapanıp açılınca ya da klasör yeniden
// açılınca "Basıldı" rozetleri kaybolup aynı fotoğraf iki kez basılmasın diye.
const PRINTED_STORAGE_KEY = 'cullprint_printed_counts';

// Anahtar dosya yolu DEĞİL, dosyanın kimliğidir: aynı kare SD karttan da diske kopyalanmış hâlinden
// de açılabilir, kartın bağlanma noktası (ör. /run/media/can/<ETİKET>/) her takılışta değişebilir.
// Yol kullanılırsa bu durumların her biri ayrı fotoğraf sayılıp rozet kaybolur. Ad + bayt boyutu
// kopyalamada değişmez; değiştirilme tarihi kopyalarken değişebildiği için anahtara girmez.
function photoKey(file: { name: string; size: number }): string {
  return `${file.name}|${file.size}`;
}

function loadPrintedCounts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PRINTED_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function recordPrintedCount(key: string, delta: number): number {
  const counts = loadPrintedCounts();
  const next = Math.max(0, (counts[key] || 0) + delta);
  if (next > 0) {
    counts[key] = next;
  } else {
    delete counts[key];
  }
  try {
    localStorage.setItem(PRINTED_STORAGE_KEY, JSON.stringify(counts));
  } catch {}
  return next;
}

export const App: React.FC = () => {
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const dragCounterRef = useRef<number>(0);

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

  // Baskı kuyruğu yalnızca bu çalıştırmaya aittir (kalıcı saklanmaz; oturum yedeği planı: memory-bank/planOturumYedegi.md).
  // Rulo sayacı ise fiziksel ruloyu izlediği için kalıcıdır.
  const [queue, setQueue] = useState<PrintJob[]>([]);

  const [rollPrintsCount, setRollPrintsCount] = useState<number>(() => {
    const saved = localStorage.getItem('cullprint_roll_prints');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false);

  // Eski sürümlerin kalıcı kuyruk kaydını temizle
  useEffect(() => {
    localStorage.removeItem('cullprint_queue');
  }, []);

  useEffect(() => {
    localStorage.setItem('cullprint_roll_prints', rollPrintsCount.toString());
  }, [rollPrintsCount]);

  // Yazıcı Ayarları
  const [printers, setPrinters] = useState<PrinterState[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [finish, setFinish] = useState<string>('Glossy');
  const [copies, setCopies] = useState<number>(1);
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

  // Periyodik CUPS senkronu güncel kuyruğu okuyabilsin; sonucu sorulan işler iki kez işlenmesin
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const resolvingJobIdsRef = useRef<Set<string>>(new Set());

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

        // Kuyruktan çıkan işlerin gerçek sonucunu sor: tamamlandı mı, dışarıdan iptal mi, hata mı
        const finishedJobs = queueRef.current.filter(
          (job) =>
            job.cupsJobId &&
            (job.status === 'printing' || job.status === 'queued') &&
            !cupsJobsById.has(job.cupsJobId) &&
            !resolvingJobIdsRef.current.has(job.id)
        );
        finishedJobs.forEach((job) => resolvingJobIdsRef.current.add(job.id));
        const outcomes = new Map<string, { state: string; message?: string }>();
        await Promise.all(
          finishedJobs.map(async (job) => {
            try {
              outcomes.set(job.id, await window.electronAPI!.getJobState(job.cupsJobId!));
            } catch {
              // Sorgu başarısızsa işi takılı bırakma: eskisi gibi tamamlandı sayılır
              outcomes.set(job.id, { state: 'unknown' });
            }
          })
        );

        // Uygulama dışından iptal edilen iş basılmadı: rozeti ve rulo sayacını geri al
        for (const job of finishedJobs) {
          if (outcomes.get(job.id)?.state !== 'canceled') continue;
          const printCount = recordPrintedCount(job.photoKey, -job.copies);
          setPhotos((prev) =>
            prev.map((p) => (photoKey(p) === job.photoKey ? { ...p, printed: printCount > 0, printCount } : p))
          );
          setRollPrintsCount((prev) => Math.max(0, prev - job.copies));
        }

        setQueue((prev) =>
          prev.map((job) => {
            if (job.cupsJobId && (job.status === 'printing' || job.status === 'queued')) {
              const outcome = outcomes.get(job.id);
              if (outcome) {
                resolvingJobIdsRef.current.delete(job.id);
                if (outcome.state === 'canceled') {
                  return { ...job, status: 'cancelled', errorMessage: undefined };
                }
                if (outcome.state === 'aborted') {
                  return { ...job, status: 'failed', errorMessage: outcome.message || 'Baskı yazıcı sistemi tarafından durduruldu' };
                }
                // 'completed' ya da ipptool yoksa 'unknown': eskisi gibi tamamlandı say
                return { ...job, status: 'completed', errorMessage: undefined };
              }
              const cupsJob = cupsJobsById.get(job.cupsJobId);
              // CUPS'ta takılı kalan işin nedenini çekmecede göster, sorun geçince kaldır
              if (cupsJob && cupsJob.problem !== job.errorMessage) {
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
    const printedCounts = loadPrintedCounts();
    // Eski sürümler yol anahtarıyla kaydediyordu: o kayıtlar ilk açılışta yeni anahtara taşınır
    let migrated = false;
    const countOf = (file: FileItem) => {
      const key = photoKey(file);
      if (printedCounts[key] === undefined && printedCounts[file.path] !== undefined) {
        printedCounts[key] = printedCounts[file.path];
        delete printedCounts[file.path];
        migrated = true;
      }
      return printedCounts[key] || 0;
    };
    const newPhotos: PhotoItem[] = newFiles.map((file) => {
      const printCount = countOf(file);
      return {
        ...file,
        printed: printCount > 0,
        printCount,
        cropOffsetX: 0,
        cropOffsetY: 0,
        userRotation: 0,
        orientation: file.orientation ?? 1,
        width: file.width || 6000,
        height: file.height || 4000,
        isLandscape: file.isLandscape ?? ((file.width || 6000) >= (file.height || 4000)),
      };
    });

    if (migrated) {
      try {
        localStorage.setItem(PRINTED_STORAGE_KEY, JSON.stringify(printedCounts));
      } catch {}
    }

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

  // Liste değişince (ör. "Basılmayan" filtresinde basılan fotoğraf çıkınca) seçim görüntülenen fotoğrafta kalır;
  // o fotoğraf listeden çıktıysa aynı sıradaki (liste sonuysa son) fotoğraf seçilir.
  const viewedPathRef = useRef<string | null>(null);
  useEffect(() => {
    const viewedPath = viewedPathRef.current;
    const idx = viewedPath ? filteredPhotos.findIndex((p) => p.path === viewedPath) : -1;
    if (idx !== -1) {
      setSelectedIndex(idx);
    } else if (filteredPhotos.length > 0) {
      setSelectedIndex((prev) => Math.min(prev, filteredPhotos.length - 1));
    }
  }, [filteredPhotos]);

  // Seçili aktif fotoğraf
  const currentPhoto = filteredPhotos[selectedIndex] || null;

  // Bu fotoğrafın kadraj modu (F ile değişir)
  const currentFitMode = getFitMode(currentPhoto);
  // Yukarıdaki efektten sonra çalışır: liste değişiminde önce eski görüntülenen fotoğraf okunur
  useEffect(() => {
    viewedPathRef.current = currentPhoto?.path ?? null;
  }, [currentPhoto?.path]);

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

  // Sayfaya sığdır ↔ kâğıdı doldur: yalnızca bu fotoğraf için (F). Seri akışta tek bir kare
  // kırpılmadan basılabilsin diye fotoğraf başına tutulur, kalıcı bir ayarı yoktur.
  const handleToggleFit = useCallback(() => {
    if (!currentPhoto) return;
    const next: FitMode = getFitMode(currentPhoto) === 'fit' ? 'fill' : 'fit';
    setPhotos((prev) => prev.map((p) => (p.path === currentPhoto.path ? { ...p, fitMode: next } : p)));
  }, [currentPhoto]);

  // Mesajlarda sürücünün seçenek etiketi kullanılır (Windows'ta yüzey değeri sürücü kimliğidir)
  const finishName = (value: string) =>
    finishDisplayName(
      value,
      printerCapabilities?.options
        .find((o) => o.name === printerCapabilities.finishOptionName)
        ?.choices.find((c) => c.value === value)?.label
    );

  // 4. Yazdırma (Baskı Motoru)
  // Baskılar arka planda sırayla hazırlanıp gönderilir: arayüz beklemez, kullanıcı gezinip basmaya devam eder.
  const printChainRef = useRef<Promise<void>>(Promise.resolve());
  const [preparingCount, setPreparingCount] = useState(0);
  // Hazırlanmakta olan fotoğraflar: aynı fotoğrafın yanlışlıkla art arda iki kez gönderilmesini engeller
  const preparingPathsRef = useRef<Set<string>>(new Set());
  // İptali süren işler: yazıcı yanıtı gelene kadar butonu kilitler (çift tıklamayı önler)
  const [cancellingJobIds, setCancellingJobIds] = useState<Set<string>>(() => new Set());
  // Hazırlanırken iptal istenen işler: sırası gelince hiç gönderilmez, gönderildiyse anında geri çekilir
  const cancelRequestedRef = useRef<Set<string>>(new Set());

  const enqueuePrint = useCallback(
    (job: PrintJob, effectiveIsLandscape: boolean, isReprint: boolean) => {
      if (!window.electronAPI || !selectedPrinter || preparingPathsRef.current.has(job.photoPath)) return;

      // Ayarlar basıldığı anda sabitlenir; kullanıcı sonra başka yazıcı/kâğıt seçse de bu iş etkilenmez
      const printerName = selectedPrinter;
      const mediaOptionName = printerCapabilities?.mediaOptionName || undefined;
      const finishOptionName = printerCapabilities?.finishOptionName || undefined;
      const summary = `${job.copies} kopya, ${finishName(job.finish)}`;

      preparingPathsRef.current.add(job.photoPath);
      setPreparingCount((n) => n + 1);
      setQueue((prev) => [job, ...prev]);

      const markCancelled = () => {
        cancelRequestedRef.current.delete(job.id);
        setQueue((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'cancelled' } : j)));
        setCancellingJobIds((prev) => {
          const next = new Set(prev);
          next.delete(job.id);
          return next;
        });
      };

      printChainRef.current = printChainRef.current.then(async () => {
        try {
          if (cancelRequestedRef.current.has(job.id)) {
            markCancelled();
            return;
          }
          // 1. Tam çözünürlüklü baskı raster'ı (ana süreçte sharp; yoksa canvas yedeği)
          const spoolPath = await createPrintFile({
            filePath: job.photoPath,
            isLandscape: effectiveIsLandscape,
            cropOffsetX: job.cropOffsetX,
            cropOffsetY: job.cropOffsetY,
            userRotation: job.userRotation,
            mediaSizeToken: job.mediaSize,
            fitMode: job.fitMode,
            dpi: 300,
          });

          // 2. Yazıcı kuyruğuna gönder
          const printResult = await window.electronAPI!.executePrint({
            filePath: spoolPath,
            printerName,
            copies: job.copies,
            mediaSize: job.mediaSize,
            finish: job.finish,
            mediaOptionName,
            finishOptionName,
          });

          if (printResult.success && cancelRequestedRef.current.has(job.id)) {
            // Hazırlanırken iptal istendi: kuyruğa ulaşan işi hemen geri çek (basıldı sayılmaz)
            const res = printResult.cupsJobId
              ? await window.electronAPI!.cancelPrintJob(printResult.cupsJobId)
              : { success: false, error: 'İş numarası alınamadı' };
            if (res.success) {
              markCancelled();
              return;
            }
            cancelRequestedRef.current.delete(job.id);
            setLastPrintStatus({ success: false, message: `${job.photoName} iptal edilemedi: ${res.error || 'Bilinmeyen hata'}` });
          }

          if (printResult.success) {
            setRollPrintsCount((prev) => prev + job.copies);
            setQueue((prev) =>
              prev.map((j) =>
                j.id === job.id
                  ? { ...j, cupsJobId: printResult.cupsJobId, status: printResult.cupsJobId ? 'queued' : 'completed' }
                  : j
              )
            );
            // Basıldı rozeti (kalıcı kayıttan)
            const printCount = recordPrintedCount(job.photoKey, job.copies);
            setPhotos((prev) =>
              prev.map((p) => (photoKey(p) === job.photoKey ? { ...p, printed: true, printCount } : p))
            );
            setLastPrintStatus({
              success: true,
              message: `${job.photoName} ${isReprint ? 'tekrar ' : ''}kuyruğa gönderildi (${summary}).`,
            });
          } else {
            setQueue((prev) =>
              prev.map((j) => (j.id === job.id ? { ...j, status: 'failed', errorMessage: printResult.error } : j))
            );
            setLastPrintStatus({
              success: false,
              message: `${job.photoName}: yazdırma hatası: ${printResult.error || 'Bilinmeyen hata'}`,
            });
          }
        } catch (err) {
          console.error('Yazdırma işlemi başarısız:', err);
          setQueue((prev) =>
            prev.map((j) =>
              j.id === job.id ? { ...j, status: 'failed', errorMessage: 'Baskı hazırlığı sırasında hata oluştu' } : j
            )
          );
          setLastPrintStatus({ success: false, message: `${job.photoName}: baskı hazırlığı sırasında hata oluştu.` });
        } finally {
          preparingPathsRef.current.delete(job.photoPath);
          setPreparingCount((n) => n - 1);
        }
      });
    },
    // finishName printerCapabilities'e bağlı
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPrinter, printerCapabilities]
  );

  const handlePrint = useCallback(() => {
    if (!currentPhoto) return;
    const isRotated90 = currentPhoto.userRotation === 90 || currentPhoto.userRotation === 270;
    const effectiveIsLandscape = isRotated90 ? !currentPhoto.isLandscape : (currentPhoto.isLandscape ?? true);
    setLastPrintStatus(null);
    enqueuePrint(
      {
        id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        photoName: currentPhoto.name,
        photoPath: currentPhoto.path,
        photoKey: photoKey(currentPhoto),
        copies,
        finish: printerSettings.finishValue || finish,
        mediaSize: printerSettings.mediaSize,
        timestamp: Date.now(),
        status: 'printing',
        cropOffsetX: currentPhoto.cropOffsetX || 0,
        cropOffsetY: currentPhoto.cropOffsetY || 0,
        userRotation: currentPhoto.userRotation || 0,
        fitMode: currentFitMode,
      },
      effectiveIsLandscape,
      false
    );
  }, [currentPhoto, currentFitMode, copies, finish, printerSettings, enqueuePrint]);

  // 4.5. Tekrar Bas (Reprint) - Kuyruk Çekmecesinden
  const handleReprintJob = useCallback(
    (job: PrintJob) => {
      const targetPhoto = photos.find((p) => p.path === job.photoPath);
      const isRotated90 = job.userRotation === 90 || job.userRotation === 270;
      const effectiveIsLandscape = isRotated90
        ? !(targetPhoto?.isLandscape ?? true)
        : (targetPhoto?.isLandscape ?? true);
      setLastPrintStatus(null);
      enqueuePrint(
        {
          ...job,
          id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          finish: job.finish || printerSettings.finishValue || finish,
          mediaSize: job.mediaSize || printerSettings.mediaSize,
          fitMode: job.fitMode || 'fill',
          timestamp: Date.now(),
          status: 'printing',
          cupsJobId: undefined,
          errorMessage: undefined,
        },
        effectiveIsLandscape,
        true
      );
    },
    [photos, printerSettings, finish, enqueuePrint]
  );

  // 4.6. Kuyruktaki İşi İptal Et

  const handleCancelJob = useCallback(async (job: PrintJob) => {
    if (!window.electronAPI) return;
    if (!job.cupsJobId) {
      // Henüz hazırlanıyor: sırası gelince gönderilmez (ya da gönderildiği anda geri çekilir)
      if (job.status === 'printing') {
        cancelRequestedRef.current.add(job.id);
        setCancellingJobIds((prev) => new Set(prev).add(job.id));
      }
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
        // İptal edilen iş basılmadı: rozeti ve rulo sayacını geri al
        const printCount = recordPrintedCount(job.photoKey, -job.copies);
        setPhotos((prev) =>
          prev.map((p) =>
            photoKey(p) === job.photoKey ? { ...p, printed: printCount > 0, printCount } : p
          )
        );
        setRollPrintsCount((prev) => Math.max(0, prev - job.copies));
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

  const handleCancelAll = useCallback(() => {
    queueRef.current
      .filter((j) => j.status === 'printing' || j.status === 'queued')
      .forEach((j) => void handleCancelJob(j));
  }, [handleCancelJob]);

  const handleClearHistory = useCallback(() => {
    setQueue((prev) => prev.filter((j) => j.status === 'printing' || j.status === 'queued'));
  }, []);

  const handleResetRoll = useCallback(() => {
    setRollPrintsCount(0);
  }, []);

  // Elle rulo sayacının kapasitesi kâğıt boyutu başına saklanır (varsayılan: 6x8 → 200, 4x6 → 400)
  const rollCapacityKey = `cullprint_roll_capacity_${printerSettings.mediaSize.replace(/\|.*$/, '')}`;
  const [rollCapacity, setRollCapacity] = useState<number>(200);
  useEffect(() => {
    const saved = Number(localStorage.getItem(rollCapacityKey));
    setRollCapacity(saved > 0 ? saved : defaultRollCapacity(printerSettings.mediaSize));
  }, [rollCapacityKey, printerSettings.mediaSize]);
  const handleChangeRollCapacity = useCallback(
    (capacity: number) => {
      if (!Number.isFinite(capacity) || capacity < 1) return;
      setRollCapacity(capacity);
      localStorage.setItem(rollCapacityKey, String(capacity));
    },
    [rollCapacityKey]
  );

  // 5. Global Klavye Kısayolları
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Ayarlar açıkken yalnızca Escape; kuyruk çekmecesi açıkken Escape ve Q (kapatmak için)
      if (isSettingsOpen && e.key !== 'Escape') {
        return;
      }
      if (isQueueOpen && e.key !== 'Escape' && e.key !== 'q' && e.key !== 'Q') {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          // Basılı tutulan tuşun otomatik tekrarı yeni baskı başlatmasın
          if (!e.repeat) handlePrint();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(0, prev - 1));
          break;

        case 'ArrowRight':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(filteredPhotos.length - 1, prev + 1));
          break;

        // Yukarı/Aşağı: fotoğrafın kırpıldığı eksende kaydır (dikeyde üst/alt, yatayda sol/sağ);
        // Sol/Sağ oklar fotoğraf değiştirmeye ayrılmış
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault();
          if (!currentPhoto) break;
          if (currentFitMode === 'fit') break; // sığdırmada kırpma yok, kaydıracak bir şey de yok
          const step = e.key === 'ArrowUp' ? -5 : 5; // Yukarı: kafa kurtar / sola kaydır
          if (getCropAxis(currentPhoto, printerSettings.mediaSize) === 'x') {
            handleAdjustCrop(step, 0);
          } else {
            handleAdjustCrop(0, step);
          }
          break;
        }

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

        case 'f':
        case 'F':
          e.preventDefault();
          handleToggleFit();
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
    handlePrint,
    handleAdjustCrop,
    handleRotate,
    handleResetCrop,
    handleToggleFit,
    currentPhoto,
    currentFitMode,
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
        activeJobCount={activeJobCount}
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
            mediaSize={printerSettings.mediaSize}
            fitMode={currentFitMode}
            onRotate={handleRotate}
            onAdjustCrop={handleAdjustCrop}
            onResetCrop={handleResetCrop}
            onToggleFit={handleToggleFit}
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
          preparingCount={preparingCount}
          onPrint={handlePrint}
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
        onCancelAll={handleCancelAll}
        rollPrintsCount={rollPrintsCount}
        onResetRoll={handleResetRoll}
        rollCapacity={rollCapacity}
        onChangeRollCapacity={handleChangeRollCapacity}
        paperLabel={formatPaperSize(printerSettings.mediaSize)}
        printerMediaRemaining={printers.find((p) => p.name === selectedPrinter)?.mediaRemaining}
        printerMarkerLevel={printers.find((p) => p.name === selectedPrinter)?.markerLevel}
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
