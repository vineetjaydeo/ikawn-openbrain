/**
 * Build a sandboxed HTML string for iframe srcdoc preview.
 */
export function buildSrcdoc(html: string): string {
  const errorScript = `
<script>
  window.addEventListener('error', (e) => {
    parent.postMessage({ type: 'IFRAME_ERROR', error: e.message, source: e.filename, line: e.lineno }, '*');
  });
  window.addEventListener('unhandledrejection', (e) => {
    parent.postMessage({ type: 'IFRAME_ERROR', error: String(e.reason) }, '*');
  });
  const origError = console.error;
  console.error = (...args) => {
    parent.postMessage({ type: 'IFRAME_ERROR', error: args.map(String).join(' ') }, '*');
    origError.apply(console, args);
  };
</script>`;

  if (html.includes('<!DOCTYPE html>') || html.includes('<!doctype html>') || html.includes('<html')) {
    if (html.includes('</body>')) {
      return html.replace('</body>', `${errorScript}\n</body>`);
    }
    return html + errorScript;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>body { margin: 0; font-family: system-ui, sans-serif; }</style>
</head>
<body>
${html}
${errorScript}
</body>
</html>`;
}
