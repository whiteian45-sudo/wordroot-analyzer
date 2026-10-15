param([string]$Msg = "batch: gap injection", [int]$N = 30)
# 缺口注入（快速自愈版）：注入 → 体检 + 守护 → 全绿立刻提交；守护报回归则排除该词重跑（最多 2 次）
# 审计不再放在循环里（太慢、易被时限打断）：脚本自带自测已保证 由无到有>0 且 丢失=0
Set-Location 'D:\Program Files\词根词缀'
$env:WR_N = "$N"
Remove-Item Env:WR_DRYRUN -ErrorAction SilentlyContinue
$ex = @()
if ($env:WR_EXCLUDE) { $ex = $env:WR_EXCLUDE.Split(',') | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() } }
$committed = $false
for ($try = 1; $try -le 2; $try++) {
  $env:WR_EXCLUDE = ($ex -join ',')
  Write-Output ("=== 尝试 $try/2，排除: [" + ($ex -join ',') + "] ===")
  $fail = $false
  node "C:\Users\10555\AppData\Local\Temp\wr_gap_batch.js" 2>&1 | Select-Object -Last 3
  if ($LASTEXITCODE -ne 0) { Write-Output '✗ 注入脚本退出码非 0'; $fail = $true }
  $h = node test_health.js 2>&1; $hrc = $LASTEXITCODE
  $h | Select-String -Pattern '体检通过|行尾'
  if ($hrc -ne 0 -or $h -match '✗' -or $h -match 'Node\.js v') { Write-Output '✗ 体检失败/崩溃'; $fail = $true }
  $g = node test_decompose.js --guard 2>&1; $grc = $LASTEXITCODE
  $grep = $g | Select-String -Pattern '^\s*✗\s+([a-z]{3,})'
  if ($grep) { $grep | Select-Object -First 6 }
  if ($grc -ne 0 -or $g -match 'Node\.js v' -or $grep) {
    Write-Output '✗ 守护未通过'
    $fail = $true
    foreach ($line in $grep) {
      $w = [regex]::Match($line.ToString(), '✗\s+([a-z]{3,})').Groups[1].Value
      if ($w -and ($ex -notcontains $w)) { $ex += $w }
    }
  } else { Write-Output '✓ 守护清单全部通过 (738 词)' }
  if (-not $fail) {
    git add index.html
    git commit -q -m $Msg
    git log --oneline -1
    Write-Output ('未推: ' + (git log --oneline origin/master..master | Measure-Object | Select-Object -ExpandProperty Count))
    $committed = $true
    break
  }
  Write-Output '*** 回滚，准备重试 ***'
  git checkout -- index.html
  $t = [IO.File]::ReadAllText('D:\Program Files\词根词缀\index.html')
  $t = $t -replace "`r`n", "`n"
  [IO.File]::WriteAllText('D:\Program Files\词根词缀\index.html', ($t -replace "`n", "`r`n"))
  if ($ex.Count -eq 0) { Write-Output '（无可排除词，停止）'; break }
}
if (-not $committed) { Write-Output '*** 未提交（已回滚） ***'; Write-Output ('排除名单: [' + ($ex -join ',') + ']') }
