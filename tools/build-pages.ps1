# 构建 GitHub Pages 静态站点：把 app/ 里的前端产物复制到 docs/
# 用法：powershell -ExecutionPolicy Bypass -File tools\build-pages.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root 'app'
$out = Join-Path $root 'docs'

if (-not (Test-Path $src)) { throw "找不到前端目录：$src" }

# 清理旧的站点文件（保留 docs 下的文档与截图）
foreach ($item in @('index.html', 'css', 'js')) {
  $p = Join-Path $out $item
  if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}

New-Item -ItemType Directory -Force -Path $out | Out-Null
Copy-Item (Join-Path $src 'index.html') (Join-Path $out 'index.html') -Force
Copy-Item (Join-Path $src 'css') (Join-Path $out 'css') -Recurse -Force
Copy-Item (Join-Path $src 'js') (Join-Path $out 'js') -Recurse -Force

# 关掉 Jekyll 处理，避免以下划线开头的文件被忽略
New-Item -ItemType File -Force -Path (Join-Path $out '.nojekyll') | Out-Null

$files = @(Get-ChildItem $out -Recurse -File | Where-Object { $_.FullName -notmatch '\\screenshots\\' })
$size = ($files | Measure-Object Length -Sum).Sum / 1KB
Write-Host ("静态站点已生成：{0}" -f $out) -ForegroundColor Green
Write-Host ("文件 {0} 个，{1:N0} KB" -f $files.Count, $size)
Write-Host ''
Write-Host '发布到 GitHub：' -ForegroundColor Cyan
Write-Host '  1. git add . && git commit -m "build: pages" && git push'
Write-Host '  2. 仓库 Settings → Pages → Source: Deploy from a branch'
Write-Host '  3. Branch 选 main，目录选 /docs，保存后等 1 分钟'
Write-Host '  4. 访问 https://<用户名>.github.io/<仓库名>/'
