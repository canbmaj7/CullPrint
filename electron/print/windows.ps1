# CullPrint Windows yazdırma yardımcısı.
# electron/print/windows.ts bu dosyayı tek bir kalıcı powershell.exe sürecine bir kez yükler, sonra CP-*
# fonksiyonlarını satır satır çağırır. Parametreler her zaman base64 JSON olarak gelir; betik metnine
# kullanıcı verisi gömülmez. Kullanıcıya gösterilecek metinler windows.ts'tedir; burada yalnızca CP_* kodları atılır.
# Dosya UTF-8 BOM ile kaydedilir: Windows PowerShell 5.1 BOM'suz dosyayı ANSI okur (scripts/windows-tani.ps1).

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Printing
Add-Type -AssemblyName ReachFramework

$global:CP_PSF = 'http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework'
$global:CP_PSK = 'http://schemas.microsoft.com/windows/2003/08/printing/printschemakeywords'
$global:CPServer = New-Object System.Printing.LocalPrintServer

function Get-CPQueueList {
  $types = [System.Printing.EnumeratedPrintQueueTypes[]]@(
    [System.Printing.EnumeratedPrintQueueTypes]::Local,
    [System.Printing.EnumeratedPrintQueueTypes]::Connections
  )
  $global:CPServer.GetPrintQueues($types)
}

# Yazıcılar her yerde FullName ile anılır (yerel yazıcıda Name ile aynı, ağ bağlantısında \\sunucu\ad)
function Get-CPQueue([string]$name) {
  foreach ($q in (Get-CPQueueList)) {
    if ($q.FullName -eq $name) { return $q }
  }
  throw 'CP_PRINTER_NOT_FOUND'
}

function Read-CPXml([System.IO.Stream]$stream) {
  $doc = New-Object System.Xml.XmlDocument
  try { $doc.Load($stream) } finally { $stream.Dispose() }
  return , $doc
}

function Test-CPElement($node, [string]$localName) {
  return ($node -is [System.Xml.XmlElement]) -and $node.LocalName -eq $localName -and $node.NamespaceURI -eq $global:CP_PSF
}

# 'ns0000:JobFoo' -> '{http://...}JobFoo': önekler belgeden belgeye değişebilir, ad alanı URI'si değişmez
function Resolve-CPName([System.Xml.XmlNode]$node, [string]$qname) {
  if (-not $qname) { return $null }
  $i = $qname.IndexOf(':')
  if ($i -lt 0) { return $qname }
  return '{' + $node.GetNamespaceOfPrefix($qname.Substring(0, $i)) + '}' + $qname.Substring($i + 1)
}

function Get-CPPrefixedName([System.Xml.XmlElement]$root, [string]$id) {
  $close = $id.IndexOf('}')
  $uri = $id.Substring(1, $close - 1)
  $prefix = $root.GetPrefixOfNamespace($uri)
  if (-not $prefix) {
    $prefix = 'cp' + $root.Attributes.Count
    $declaration = $root.OwnerDocument.CreateAttribute('xmlns', $prefix, 'http://www.w3.org/2000/xmlns/')
    $declaration.Value = $uri
    [void]$root.Attributes.Append($declaration)
  }
  return $prefix + ':' + $id.Substring($close + 1)
}

function Get-CPDisplayName([System.Xml.XmlNode]$node) {
  $displayName = '{' + $global:CP_PSK + '}DisplayName'
  foreach ($child in $node.ChildNodes) {
    if ((Test-CPElement $child 'Property') -and (Resolve-CPName $child $child.GetAttribute('name')) -eq $displayName) {
      return $child.InnerText.Trim()
    }
  }
  return $null
}

# PrintTicket'taki her üst düzey özelliğin seçili seçeneği: '{uri}Özellik' -> '{uri}Seçenek'
function Get-CPTicketSelections([System.Xml.XmlDocument]$ticket) {
  $map = @{}
  foreach ($f in $ticket.DocumentElement.ChildNodes) {
    if (-not (Test-CPElement $f 'Feature')) { continue }
    foreach ($o in $f.ChildNodes) {
      if (Test-CPElement $o 'Option') {
        $map[(Resolve-CPName $f $f.GetAttribute('name'))] = Resolve-CPName $o $o.GetAttribute('name')
        break
      }
    }
  }
  return $map
}

function Set-CPTicketOption([System.Xml.XmlDocument]$ticket, [string]$featureId, [string]$optionId) {
  $root = $ticket.DocumentElement
  $psfPrefix = $root.GetPrefixOfNamespace($global:CP_PSF)
  $feature = $null
  foreach ($f in $root.ChildNodes) {
    if ((Test-CPElement $f 'Feature') -and (Resolve-CPName $f $f.GetAttribute('name')) -eq $featureId) {
      $feature = $f
      break
    }
  }
  if ($null -eq $feature) {
    $feature = $ticket.CreateElement($psfPrefix, 'Feature', $global:CP_PSF)
    [void]$feature.SetAttribute('name', (Get-CPPrefixedName $root $featureId))
    [void]$root.AppendChild($feature)
  }
  foreach ($o in @($feature.ChildNodes)) {
    if (Test-CPElement $o 'Option') { [void]$feature.RemoveChild($o) }
  }
  $option = $ticket.CreateElement($psfPrefix, 'Option', $global:CP_PSF)
  [void]$option.SetAttribute('name', (Get-CPPrefixedName $root $optionId))
  [void]$feature.AppendChild($option)
}

function CP-GetPrinters($p) {
  # 1452 = Dai Nippon Printing USB üretici kimliği
  $dnpUsb = $false
  try {
    $dnpUsb = $null -ne (Get-CimInstance -ClassName Win32_PnPEntity -Filter "PNPDeviceID LIKE 'USB\\VID_1452%'" | Select-Object -First 1)
  } catch { }
  $defaultName = $null
  try { $defaultName = (New-Object System.Printing.LocalPrintServer).DefaultPrintQueue.FullName } catch { }

  foreach ($q in (Get-CPQueueList)) {
    $q.Refresh()
    $driver = ''
    try { $driver = $q.QueueDriver.Name } catch { }
    [pscustomobject]@{
      name             = $q.FullName
      driver           = $driver
      isDefault        = ($q.FullName -eq $defaultName)
      paused           = $q.IsPaused
      printing         = $q.IsPrinting
      offline          = $q.IsOffline
      outOfPaper       = $q.IsOutOfPaper
      paperJam         = $q.IsPaperJammed
      doorOpen         = $q.IsDoorOpened
      manualFeed       = $q.IsManualFeedRequired
      userIntervention = $q.NeedUserIntervention
      notAvailable     = $q.IsNotAvailable
      inError          = $q.IsInError
      dnpUsb           = $dnpUsb
    }
  }
}

# Kâğıt boyutları System.Drawing'den (DEVMODE formları), diğer sürücü seçenekleri PrintCapabilities'ten
function CP-GetOptions($p) {
  $q = Get-CPQueue $p.printer
  $ps = New-Object System.Drawing.Printing.PrinterSettings
  $ps.PrinterName = $p.printer
  $defaultKind = $ps.DefaultPageSettings.PaperSize.RawKind
  $papers = @(foreach ($s in $ps.PaperSizes) {
      [pscustomobject]@{
        name      = $s.PaperName
        rawKind   = $s.RawKind
        width     = $s.Width
        height    = $s.Height
        isDefault = ($s.RawKind -eq $defaultKind)
      }
    })

  $caps = Read-CPXml $q.GetPrintCapabilitiesAsXml()
  $selected = Get-CPTicketSelections (Read-CPXml $q.UserPrintTicket.GetXmlStream())
  $mediaSizeId = '{' + $global:CP_PSK + '}PageMediaSize'

  $features = @(foreach ($f in $caps.DocumentElement.ChildNodes) {
      if (-not (Test-CPElement $f 'Feature')) { continue }
      $id = Resolve-CPName $f $f.GetAttribute('name')
      if ($id -eq $mediaSizeId) { continue }
      $options = @(foreach ($o in $f.ChildNodes) {
          if ((Test-CPElement $o 'Option') -and $o.GetAttribute('name')) {
            $oid = Resolve-CPName $o $o.GetAttribute('name')
            $label = Get-CPDisplayName $o
            if (-not $label) { $label = $oid.Substring($oid.IndexOf('}') + 1) }
            [pscustomobject]@{ id = $oid; label = $label }
          }
        })
      if ($options.Count -lt 2) { continue }
      $label = Get-CPDisplayName $f
      if (-not $label) { $label = $id.Substring($id.IndexOf('}') + 1) }
      [pscustomobject]@{ id = $id; label = $label; options = $options; selected = $selected[$id] }
    })

  [pscustomobject]@{ papers = $papers; features = $features }
}

function CP-Print($p) {
  $ps = New-Object System.Drawing.Printing.PrinterSettings
  $ps.PrinterName = $p.printer
  if (-not $ps.IsValid) { throw 'CP_PRINTER_NOT_FOUND' }

  # Sürücüye özel seçenekler (ör. DNP yüzey kaplaması) yalnızca PrintTicket -> DEVMODE ile verilebilir
  $devmode = $null
  $selections = @($p.features)
  if ($selections.Count -gt 0) {
    $q = Get-CPQueue $p.printer
    $ticket = Read-CPXml $q.UserPrintTicket.GetXmlStream()
    foreach ($s in $selections) { Set-CPTicketOption $ticket $s.feature $s.option }
    $ms = New-Object System.IO.MemoryStream
    $ticket.Save($ms)
    $ms.Position = 0
    $delta = New-Object System.Printing.PrintTicket -ArgumentList $ms
    $merged = $q.MergeAndValidatePrintTicket($q.UserPrintTicket, $delta).ValidatedPrintTicket
    $converter = New-Object System.Printing.Interop.PrintTicketConverter -ArgumentList $q.FullName, $q.ClientPrintSchemaVersion
    try {
      $devmode = $converter.ConvertPrintTicketToDevMode($merged, [System.Printing.Interop.BaseDevModeType]::UserDefault)
    } finally { $converter.Dispose() }
  }

  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings = $ps
  $doc.DocumentName = $p.docName
  # Varsayılan denetleyici "Yazdırılıyor..." penceresi açar
  $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
  $doc.OriginAtMargins = $false
  # PrinterSettings.DefaultPageSettings her okunuşta yeni nesne döner; sayfa ayarı belgenin kendisinde yapılır
  $page = $doc.DefaultPageSettings

  if ($null -ne $devmode) {
    $h = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($devmode.Length)
    try {
      [System.Runtime.InteropServices.Marshal]::Copy($devmode, 0, $h, $devmode.Length)
      $ps.SetHdevmode($h)
      $page.SetHdevmode($h)
    } finally { [System.Runtime.InteropServices.Marshal]::FreeHGlobal($h) }
  }

  $paper = $page.PaperSize
  if ($p.paperRawKind) {
    foreach ($s in $ps.PaperSizes) {
      if ($s.RawKind -eq [int]$p.paperRawKind) { $paper = $s; break }
    }
    $page.PaperSize = $paper
  }

  # Baskıdan sonra yeni işi ayırt edebilmek için kuyruğun mevcut hâli not edilir
  $before = @{}
  try {
    $q0 = Get-CPQueue $p.printer
    $q0.Refresh()
    foreach ($j in $q0.GetPrintJobInfoCollection()) { $before[[int]$j.JobIdentifier] = $true }
  } catch { }

  $img = [System.Drawing.Image]::FromFile($p.file)
  try {
    # Raster zaten kâğıt yönünde üretilir; yatay raster için sayfayı yatay çevir
    $page.Landscape = (($img.Width -gt $img.Height) -ne ($paper.Width -gt $paper.Height))
    $page.Margins = New-Object System.Drawing.Printing.Margins -ArgumentList 0, 0, 0, 0

    $copies = [int]$p.copies
    $state = @{ left = 1 }
    if ($copies -le $ps.MaximumCopies) {
      $ps.Copies = [int16]$copies
    } else {
      # Sürücü bu kadar kopyayı desteklemiyorsa her kopya ayrı sayfa
      $ps.Copies = 1
      $state.left = $copies
    }

    $doc.add_PrintPage({
        param($source, $e)
        $g = $e.Graphics
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        # Kenarsız: tüm sayfayı kapla (oran farkı varsa ortadan kırp). Çizim orijini yazdırılabilir
        # alanın köşesidir, sayfa köşesine donanım kenar boşluğu kadar geri kaydırılır.
        $b = $e.PageBounds
        $scale = [Math]::Max($b.Width / $img.Width, $b.Height / $img.Height)
        $w = $img.Width * $scale
        $h = $img.Height * $scale
        $x = ($b.Width - $w) / 2 - $e.PageSettings.HardMarginX
        $y = ($b.Height - $h) / 2 - $e.PageSettings.HardMarginY
        $g.DrawImage($img, [single]$x, [single]$y, [single]$w, [single]$h)
        $state.left--
        $e.HasMorePages = $state.left -gt 0
      }.GetNewClosure())
    $doc.Print()
  } finally {
    $img.Dispose()
    $doc.Dispose()
  }

  # PrintDocument iş numarası döndürmez, spooler işi de Print() dönerken henüz kuyrukta olmayabilir.
  # Belge adı sürücüye göre değişebildiği için ad yalnızca ipucu: asıl ölçüt baskıdan önce kuyrukta
  # olmayan yeni iştir. En fazla ~2 sn beklenir; bu sürede çıkmazsa iş zaten bitmiş demektir.
  $jobId = $null
  for ($i = 0; $i -lt 40 -and $null -eq $jobId; $i++) {
    try {
      $q = Get-CPQueue $p.printer
      $q.Refresh()
      $named = $null
      $newest = $null
      foreach ($j in $q.GetPrintJobInfoCollection()) {
        $id = [int]$j.JobIdentifier
        if ($before.ContainsKey($id)) { continue }
        if ($j.Name -eq $p.docName -and ($null -eq $named -or $id -gt $named)) { $named = $id }
        if ($null -eq $newest -or $id -gt $newest) { $newest = $id }
      }
      if ($null -ne $named) { $jobId = $named } elseif ($null -ne $newest) { $jobId = $newest }
    } catch { }
    if ($null -eq $jobId) { Start-Sleep -Milliseconds 50 }
  }
  [pscustomobject]@{ jobId = $jobId }
}

function CP-GetJobs($p) {
  foreach ($q in (Get-CPQueueList)) {
    foreach ($j in $q.GetPrintJobInfoCollection()) {
      [pscustomobject]@{
        printer   = $q.FullName
        id        = $j.JobIdentifier
        name      = $j.Name
        user      = $j.Submitter
        size      = $j.JobSize
        submitted = $j.TimeJobSubmitted.ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss')
        status    = $j.JobStatus.ToString()
      }
    }
  }
}

function CP-CancelJob($p) {
  $q = Get-CPQueue $p.printer
  try {
    $job = $q.GetJob([int]$p.id)
  } catch {
    # İş kuyrukta yok: zaten bitmiş ya da iptal edilmiş
    return [pscustomobject]@{ gone = $true }
  }
  $job.Cancel()
  [pscustomobject]@{ gone = $false }
}

function CP-SetPaused($p) {
  $q = New-Object System.Printing.PrintQueue -ArgumentList $global:CPServer, $p.printer, ([System.Printing.PrintSystemDesiredAccess]::AdministratePrinter)
  try {
    if ($p.paused) { $q.Pause() } else { $q.Resume() }
  } finally { $q.Dispose() }
  [pscustomobject]@{ paused = [bool]$p.paused }
}
