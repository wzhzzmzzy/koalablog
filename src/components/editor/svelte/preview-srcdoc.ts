function previewContentSecurityPolicy(parentOrigin: string) {
  const connectSources = ['https:']
  try {
    const parentUrl = new URL(parentOrigin)
    if (parentUrl.protocol === 'http:' && (parentUrl.hostname === '127.0.0.1' || parentUrl.hostname === 'localhost'))
      connectSources.push(parentOrigin)
  }
  catch {
    // The empty server-rendered placeholder cannot receive Preview commands.
  }
  return [
    'default-src \'none\'',
    'base-uri \'none\'',
    `connect-src ${connectSources.join(' ')}`,
    'font-src data: http: https:',
    'img-src data: http: https:',
    'media-src http: https:',
    'script-src \'unsafe-inline\' \'unsafe-eval\'',
    'style-src \'unsafe-inline\'',
  ].join('; ')
}

export const previewRootAttribute = 'data-koala-artifact-root'

function bootstrapScript(parentOrigin: string) {
  return `(() => {
  const expectedParentOrigin = ${JSON.stringify(parentOrigin)};
  const root = document.querySelector('[${previewRootAttribute}]');
  const style = document.querySelector('style[data-koala-artifact]');
  let active = null;
  let latestCommandId = 0;
  let renderQueue = Promise.resolve();

  function message(type, commandId, extra) {
    window.parent.postMessage({ type, commandId, ...extra }, '*');
  }

  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  async function clearActive() {
    if (active && typeof active.api.unmount === 'function')
      await active.api.unmount(active.instance);
    active = null;
    root.replaceChildren();
  }

  function isRenderCommand(value) {
    return value
      && (value.type === 'koala-preview-render' || value.type === 'koala-preview-snapshot')
      && Number.isSafeInteger(value.commandId)
      && value.commandId > 0
      && value.artifact
      && typeof value.artifact.javascript === 'string'
      && typeof value.artifact.css === 'string';
  }

  async function render(command) {
    try {
      await clearActive();
      if (command.commandId !== latestCommandId)
        return;
      style.textContent = command.artifact.css;
      const api = (0, eval)(command.artifact.javascript);
      if (!api || typeof api.mount !== 'function' || typeof api.unmount !== 'function')
        throw new Error('Preview Artifact must export mount and unmount functions');
      const instance = api.mount(root);
      if (command.commandId !== latestCommandId) {
        await api.unmount(instance);
        return;
      }
      active = { api, commandId: command.commandId, instance };
      if (command.type === 'koala-preview-snapshot') {
        if (typeof api.flushSync === 'function')
          api.flushSync();
        if (typeof api.tick === 'function')
          await api.tick();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (command.commandId !== latestCommandId)
          return;
        message('koala-preview-snapshot-result', command.commandId, { html: root.innerHTML });
        return;
      }
      message('koala-preview-complete', command.commandId);
    }
    catch (error) {
      if (command.commandId !== latestCommandId)
        return;
      root.replaceChildren();
      message('koala-preview-error', command.commandId, { message: errorMessage(error) });
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.origin !== expectedParentOrigin || !isRenderCommand(event.data))
      return;
    if (event.data.commandId <= latestCommandId)
      return;
    latestCommandId = event.data.commandId;
    renderQueue = renderQueue.then(() => render(event.data));
  });

  window.addEventListener('error', (event) => {
    if (active)
      message('koala-preview-runtime-error', active.commandId, { message: errorMessage(event.error || event.message || 'Preview runtime error') });
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (active)
      message('koala-preview-runtime-error', active.commandId, { message: errorMessage(event.reason) });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active) {
      event.preventDefault();
      message('koala-preview-focus-return', active.commandId);
    }
  });
})();`
}

function defaultParentOrigin() {
  return typeof window === 'undefined' ? '' : window.location.origin
}

export function createPreviewSrcdoc(parentOrigin = defaultParentOrigin()) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${previewContentSecurityPolicy(parentOrigin)}">
    <style data-koala-artifact></style>
  </head>
  <body>
    <div ${previewRootAttribute}></div>
    <script>${bootstrapScript(parentOrigin)}</script>
  </body>
</html>`
}
