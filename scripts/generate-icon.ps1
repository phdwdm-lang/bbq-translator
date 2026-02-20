# Generate BBQ Translator "B" icon as ICO file
Add-Type -AssemblyName System.Drawing

function Create-BLogoPNG {
    param([string]$OutputPath, [int]$Size)

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # Indigo color #4F46E5
    $bgColor = [System.Drawing.Color]::FromArgb(255, 79, 70, 229)
    $bgBrush = New-Object System.Drawing.SolidBrush($bgColor)

    $pad    = [int]($Size * 0.05)
    $w      = $Size - 2 * $pad
    $h      = $Size - 2 * $pad
    $radius = [int]($Size * 0.22)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($pad,              $pad,              $radius * 2, $radius * 2, 180, 90)
    $path.AddArc($pad + $w - $radius * 2, $pad,              $radius * 2, $radius * 2, 270, 90)
    $path.AddArc($pad + $w - $radius * 2, $pad + $h - $radius * 2, $radius * 2, $radius * 2,   0, 90)
    $path.AddArc($pad,              $pad + $h - $radius * 2, $radius * 2, $radius * 2,  90, 90)
    $path.CloseFigure()
    $g.FillPath($bgBrush, $path)

    # White "B" text
    $fontSize  = [int]($Size * 0.56)
    $font      = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $sf        = New-Object System.Drawing.StringFormat
    $sf.Alignment     = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $g.DrawString("B", $font, $whiteBrush, $rect, $sf)

    $g.Dispose()
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

$buildDir = Join-Path $PSScriptRoot "..\build"
if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir | Out-Null }

$pngPath = Join-Path $buildDir "icon_256.png"
Create-BLogoPNG -OutputPath $pngPath -Size 256
Write-Host "Created PNG: $pngPath"

# Wrap the PNG in ICO format (PNG-in-ICO, supported by Windows Vista+)
$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$pngSize  = $pngBytes.Length

$icoPath = Join-Path $buildDir "icon.ico"
$ms = New-Object System.IO.MemoryStream

# ICO header (6 bytes)
$ms.WriteByte(0); $ms.WriteByte(0)          # reserved
$ms.WriteByte(1); $ms.WriteByte(0)          # type = ICO
$ms.WriteByte(1); $ms.WriteByte(0)          # image count = 1

# Image directory entry (16 bytes)
$ms.WriteByte(0)                            # width  (0 = 256)
$ms.WriteByte(0)                            # height (0 = 256)
$ms.WriteByte(0)                            # color count
$ms.WriteByte(0)                            # reserved
$ms.WriteByte(1); $ms.WriteByte(0)          # planes
$ms.WriteByte(32); $ms.WriteByte(0)         # bit count

# image data size (4 bytes LE)
$ms.WriteByte($pngSize -band 0xFF)
$ms.WriteByte(($pngSize -shr 8)  -band 0xFF)
$ms.WriteByte(($pngSize -shr 16) -band 0xFF)
$ms.WriteByte(($pngSize -shr 24) -band 0xFF)

# image data offset = 22 (header 6 + dir 16)
$ms.WriteByte(22); $ms.WriteByte(0); $ms.WriteByte(0); $ms.WriteByte(0)

# PNG data
$ms.Write($pngBytes, 0, $pngBytes.Length)

[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$ms.Dispose()

Write-Host "Created ICO: $icoPath"
Remove-Item $pngPath -Force
Write-Host "Done."
