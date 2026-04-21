function line(char = '─', len = 52) { return char.repeat(len); }

function header(title) {
  console.log('\n  ' + line('═'));
  console.log('  ' + title.toUpperCase());
  console.log('  ' + line('═'));
}

function row(label, value, indent = 2) {
  const pad = ' '.repeat(indent);
  const gap = ' '.repeat(Math.max(1, 22 - label.length));
  console.log(`${pad}${label}${gap}${value}`);
}

function verdict(text) {
  console.log('');
  // Wrap at 50 chars
  const words = text.split(' ');
  let currentLine = '  ';
  words.forEach(w => {
    if ((currentLine + w).length > 54) { console.log(currentLine); currentLine = '  '; }
    currentLine += w + ' ';
  });
  if (currentLine.trim()) console.log(currentLine);
}

function sources(list) {
  console.log('');
  list.forEach(s => console.log('  • ' + s));
}

function footer() {
  console.log('  ' + line('═'));
  console.log('');
}

function spinner(text) {
  process.stdout.write('  ' + text);
}

function done(text) {
  process.stdout.write(' ' + text + '\n');
}

function progress(domain, status) {
  const icon = status === 'ok' ? '✓' : status === 'fail' ? '✗' : '…';
  const dots = '.'.repeat(Math.max(1, 36 - domain.length));
  console.log(`  ├── ${domain} ${dots} ${icon}`);
}

function lastProgress(domain, status) {
  const icon = status === 'ok' ? '✓' : '✗';
  const dots = '.'.repeat(Math.max(1, 36 - domain.length));
  console.log(`  └── ${domain} ${dots} ${icon}`);
}

module.exports = { header, row, verdict, sources, footer, spinner, done, progress, lastProgress, line };
