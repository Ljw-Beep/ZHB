param(
  [string]$RepoName = '',
  [string]$Token = ''
)# 一键部署到 GitHub Pages
# 需要：GitHub Personal Access Token（classic，勾选 repo 权限）
# 作用：创建仓库 → 推送代码 → 开启 Pages → 输出访问地址
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host ''
Write-Host '================ GitHub 部署向导 ================' -ForegroundColor Cyan
Write-Host ''
Write-Host '需要一个 GitHub Personal Access Token（只需一次）：' -ForegroundColor Yellow
Write-Host '  1. 打开 https://github.com/settings/tokens'
Write-Host '  2. Generate new token → Generate new token (classic)'
Write-Host '  3. Note 随便填，Expiration 选 30 days'
Write-Host '  4. 勾选 repo（第一个大项，包含全部子项）'
Write-Host '  5. 点最下面 Generate token，复制那一串 ghp_ 开头的字符'
Write-Host ''

$repoName = $RepoName
if ([string]::IsNullOrWhiteSpace($repoName)) {
  $repoName = Read-Host '新仓库名（回车用默认 jizhang）'
}
if ([string]::IsNullOrWhiteSpace($repoName)) { $repoName = 'jizhang' }
$repoName = ($repoName -replace '[^A-Za-z0-9._-]', '-').Trim('-')
if ([string]::IsNullOrWhiteSpace($repoName)) { throw '仓库名不合法' }

$token = $Token
if ([string]::IsNullOrWhiteSpace($token)) {
  $secure = Read-Host '粘贴 Token（输入时不显示）' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if ([string]::IsNullOrWhiteSpace($token)) { throw '没有输入 Token' }

$headers = @{
  Authorization = "token $token"
  'User-Agent'  = 'ledger-deploy'
  Accept        = 'application/vnd.github+json'
}

Write-Host ''
Write-Host '[1/4] 校验账号…'
try {
  $user = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $headers -TimeoutSec 30
} catch {
  throw 'Token 无效或没有权限（请确认勾选了 repo 且没有过期）'
}
$owner = $user.login
Write-Host ("      当前账号：{0}" -f $owner) -ForegroundColor Green

Write-Host '[2/4] 准备仓库…'
$repoUrl = "https://api.github.com/repos/$owner/$repoName"
$exists = $true
try { $null = Invoke-RestMethod -Uri $repoUrl -Headers $headers -TimeoutSec 30 }
catch { $exists = $false }

if (-not $exists) {
  $body = @{
    name        = $repoName
    description = '个人记账本（纯前端，数据保存在浏览器）'
    private     = $false
    auto_init   = $false
  } | ConvertTo-Json
  $null = Invoke-RestMethod -Uri 'https://api.github.com/user/repos' -Method Post -Headers $headers -Body $body -ContentType 'application/json' -TimeoutSec 30
  Write-Host ("      已创建仓库：{0}/{1}" -f $owner, $repoName) -ForegroundColor Green
} else {
  Write-Host ("      仓库已存在：{0}/{1}，将更新内容" -f $owner, $repoName) -ForegroundColor Yellow
}

Write-Host '[3/4] 推送代码…'
$pushUrl = "https://x-access-token:$token@github.com/$owner/$repoName.git"
git remote remove origin 2>$null | Out-Null
git remote add origin $pushUrl
$pushOut = git push -u origin main --force 2>&1
if ($LASTEXITCODE -ne 0) {
  git remote set-url origin "https://github.com/$owner/$repoName.git"
  $pushOut | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
  throw '推送失败，请把上面的错误发给我'
}
# 推送完成后立刻把 token 从配置里去掉
git remote set-url origin "https://github.com/$owner/$repoName.git"
Write-Host '      代码已推送' -ForegroundColor Green

Write-Host '[4/4] 开启 GitHub Pages…'
$pagesBody = @{ source = @{ branch = 'main'; path = '/docs' } } | ConvertTo-Json -Depth 5
$pagesOk = $false
try {
  $null = Invoke-RestMethod -Uri "$repoUrl/pages" -Method Post -Headers $headers -Body $pagesBody -ContentType 'application/json' -TimeoutSec 30
  $pagesOk = $true
} catch {
  try {
    $null = Invoke-RestMethod -Uri "$repoUrl/pages" -Method Put -Headers $headers -Body $pagesBody -ContentType 'application/json' -TimeoutSec 30
    $pagesOk = $true
  } catch { $pagesOk = $false }
}

if (-not $pagesOk) {
  Write-Host '      自动开启失败（可能 token 缺少 Pages 权限），请手动设置：' -ForegroundColor Yellow
  Write-Host '      仓库 Settings → Pages → Branch: main，目录 /docs' -ForegroundColor Yellow
}

$site = "https://$($owner.ToLower()).github.io/$repoName/"
Write-Host ''
Write-Host '等待站点生效（最多 2 分钟）…'
$ready = $false
for ($i = 0; $i -lt 24; $i++) {
  Start-Sleep -Seconds 5
  try {
    $resp = Invoke-WebRequest $site -UseBasicParsing -TimeoutSec 10
    if ($resp.StatusCode -eq 200) { $ready = $true; break }
  } catch { }
  Write-Host ("      第 {0} 次检查…" -f ($i + 1)) -ForegroundColor DarkGray
}

Write-Host ''
if ($ready) {
  Write-Host '================================================' -ForegroundColor Green
  Write-Host ' 部署完成！打开：' -ForegroundColor Green
  Write-Host " $site" -ForegroundColor Cyan
  Write-Host '================================================' -ForegroundColor Green
} else {
  Write-Host '代码已推送，但站点还没就绪。' -ForegroundColor Yellow
  Write-Host "请 1 分钟后访问：$site"
  Write-Host '如果打不开：仓库 Settings → Pages，确认 Source = main，目录 = /docs'
}
Write-Host ''
Write-Host "仓库地址：https://github.com/$owner/$repoName" -ForegroundColor DarkGray
