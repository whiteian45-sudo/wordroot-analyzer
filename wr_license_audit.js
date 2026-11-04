/* 提交前许可审计：确认版权数据 / 本地生成数据 / 用户状态没有被 git 跟踪。
   用法：node wr_license_audit.js   （CI 也在用；发现问题退出码 1） */
const { execSync } = require('child_process');
const fs = require('fs');
const DIR = __dirname;

let files;
try {
  files = execSync('git -c core.quotepath=false ls-files', { cwd: DIR, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .split('\n').filter(Boolean);
} catch (e) {
  console.log('✗ 不是 git 仓库或 git 不可用：' + e.message);
  process.exit(1);
}

const forbidden = [
  { re: /(^|\/)(oxford|etym|thes|ex|us_ipa)\.json$/i, why: '商业词典派生数据' },
  { re: /(^|\/)morph\.json$/i, why: '本地生成形态库（含 MorphoLex 非商业数据）' },
  { re: /(^|\/)(history|favs|study)\.json$/i, why: '用户本地状态' },
  { re: /(^|\/)dict\.db$/i, why: '本地生成词典数据库' },
  { re: /(^|\/)atlas_media\//i, why: '按需下载的媒体文件' },
  { re: /(^|\/)_archive\//i, why: '过程归档（应留在本地）' },
  { re: /\.bak$/i, why: '备份文件' },
];

const bad = [];
for (const f of files) {
  for (const rule of forbidden) {
    if (rule.re.test(f)) { bad.push(f + '  (' + rule.why + ')'); break; }
  }
}

console.log('跟踪文件数：' + files.length);
if (bad.length) {
  console.log('✗ 发现不应入库的文件：');
  bad.forEach(x => console.log('  - ' + x));
  process.exit(1);
}
console.log('✓ 许可审计通过：未发现版权/本地数据被跟踪');
