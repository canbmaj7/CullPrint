#!/bin/sh
# build/icon.svg'den uygulama ikonlarını üretir (rsvg-convert gerekir).
#   build/icon.png  1024 px: electron-builder Windows .ico, macOS .icns ve Linux ikonunu bundan üretir
#   public/icon.png  512 px: çalışan uygulamanın pencere/görev çubuğu ikonu (dist/ içine kopyalanır)
set -e
cd "$(dirname "$0")/.."
rsvg-convert -w 1024 -h 1024 build/icon.svg -o build/icon.png
rsvg-convert -w 512 -h 512 build/icon.svg -o public/icon.png
