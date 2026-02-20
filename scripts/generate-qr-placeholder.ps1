Add-Type -AssemblyName System.Drawing

$size = 400
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)

$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 147, 197, 253), 3)
$g.DrawRectangle($borderPen, 2, 2, ($size - 4), ($size - 4))

$font = New-Object System.Drawing.Font("Arial", 20, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 99, 102, 241))
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
$g.DrawString("QQ交流群二维码", $font, $brush, $rect, $sf)

$g.Dispose()
$outPath = Join-Path $PSScriptRoot "..\public\images\qq-qrcode.png"
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "Created: $outPath"
