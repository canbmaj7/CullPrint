# CullPrint Windows tanı betiği: uygulamanın kullandığı PowerShell yardımcısını (electron/print/windows.ps1)
# doğrudan çalıştırır ve sonuçları cullprint-tani.txt dosyasına yazar. Baskı yapmaz.
# Çalıştırma (depo klasöründe):  powershell -ExecutionPolicy Bypass -File scripts\windows-tani.ps1

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here '..\electron\print\windows.ps1')
$out = Join-Path (Get-Location) 'cullprint-tani.txt'

& {
  "== PowerShell $($PSVersionTable.PSVersion) / $([Environment]::OSVersion.VersionString)"
  "== Yazıcılar"
  $printers = @(CP-GetPrinters $null)
  $printers | Format-List | Out-String
  "== Kuyruktaki işler"
  CP-GetJobs $null | Format-Table -AutoSize | Out-String
  foreach ($pr in $printers) {
    "== Seçenekler: $($pr.name)"
    try {
      $opts = CP-GetOptions ([pscustomobject]@{ printer = $pr.name })
      $opts.papers | Format-Table -AutoSize | Out-String
      foreach ($f in $opts.features) {
        "$($f.label) [$($f.id)] seçili=$($f.selected)"
        foreach ($o in $f.options) { "    $($o.label) [$($o.id)]" }
      }
      $q = Get-CPQueue $pr.name
      $caps = Read-CPXml $q.GetPrintCapabilitiesAsXml()
      "--- PrintCapabilities XML"
      $caps.OuterXml
    } catch { "HATA: $($_.Exception.GetBaseException().Message)" }
  }
} *>&1 | Tee-Object -FilePath $out
"Sonuç kaydedildi: $out"
