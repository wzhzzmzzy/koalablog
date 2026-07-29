/**
 * Browser-only helpers exposed to trusted Svelte Artifacts as
 * `@koala/page-runtime`. Keep this source dependency-free: it is loaded by
 * browser Rollup, not by the app's Vite module graph at Artifact build time.
 */
export const KOALA_PAGE_RUNTIME_MODULE = '@koala/page-runtime'

export const KOALA_PAGE_RUNTIME_MODULE_SOURCE = String.raw`
export class ActionError extends Error {
  constructor(input) {
    super(input.message || 'Action failed');
    this.name = 'ActionError';
    this.code = input.code || 'INTERNAL_SERVER_ERROR';
    this.status = input.status || 500;
  }
}

export class OwnerAccessError extends Error {
  constructor(path) {
    super('This page can only edit its own private state file.');
    this.name = 'OwnerAccessError';
    this.path = path;
  }
}

function decodeDevalue(serialized) {
  const values = JSON.parse(serialized);
  if (!Array.isArray(values) || values.length === 0)
    throw new Error('Invalid Action response.');

  const hydrated = [];
  const hydrate = (index) => {
    if (index === -1)
      return undefined;
    if (!Number.isInteger(index) || index < 0 || index >= values.length)
      throw new Error('Invalid Action response.');
    if (Object.hasOwn(hydrated, index))
      return hydrated[index];

    const value = values[index];
    if (value === null || typeof value !== 'object') {
      hydrated[index] = value;
      return value;
    }
    if (Array.isArray(value)) {
      if (typeof value[0] === 'string') {
        if (value[0] !== 'Date' || typeof value[1] !== 'string')
          throw new Error('Unsupported Action response.');
        const date = new Date(value[1]);
        if (Number.isNaN(date.getTime()))
          throw new Error('Invalid Action response.');
        hydrated[index] = date;
        return date;
      }
      const array = [];
      hydrated[index] = array;
      for (const item of value)
        array.push(hydrate(item));
      return array;
    }

    const object = {};
    hydrated[index] = object;
    for (const [key, reference] of Object.entries(value)) {
      if (key === '__proto__')
        throw new Error('Invalid Action response.');
      object[key] = hydrate(reference);
    }
    return object;
  };

  return hydrate(0);
}

function actionError(response, body) {
  let payload = {};
  try {
    payload = JSON.parse(body);
  }
  catch {
    // Keep a safe generic message if a proxy returned a non-Action response.
  }
  return new ActionError({
    code: typeof payload.code === 'string' ? payload.code : 'INTERNAL_SERVER_ERROR',
    message: typeof payload.message === 'string' ? payload.message : 'Action failed.',
    status: response.status,
  });
}

export async function callAction(path, input) {
  const bodyIsForm = input instanceof FormData;
  const headers = { Accept: 'application/json' };
  let body = input;
  if (!bodyIsForm) {
    body = JSON.stringify(input);
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    body,
    credentials: 'same-origin',
    headers,
    method: 'POST',
  });
  if (response.status === 204)
    return undefined;
  const text = await response.text();
  if (!response.ok)
    throw actionError(response, text);
  return decodeDevalue(text);
}

function ownedMarkdownFile(value, path) {
  if (!value || typeof value !== 'object'
    || value.path !== path
    || value.renderer !== 'markdown'
    || value.private !== true
    || value.deletedAt != null
    || !Number.isInteger(value.id)
    || !Number.isInteger(value.revision)
    || typeof value.content !== 'string') {
    throw new OwnerAccessError(path);
  }
  return value;
}

export async function readOwnedMarkdown(input) {
  const files = await callAction('/_actions/db.markdown.byPrefix', { prefix: input.prefix });
  if (!Array.isArray(files))
    throw new Error('Invalid File list response.');
  return ownedMarkdownFile(files.find(file => file && file.path === input.path), input.path);
}

export async function saveOwnedMarkdown(file, content) {
  const current = ownedMarkdownFile(file, file && file.path);
  if (typeof content !== 'string')
    throw new TypeError('Markdown content must be a string.');

  const form = new FormData();
  form.set('id', String(current.id));
  form.set('path', current.path);
  form.set('renderer', 'markdown');
  form.set('content', content);
  form.set('private', 'true');
  form.set('baseRevision', String(current.revision));
  return ownedMarkdownFile(await callAction('/_actions/form.save', form), current.path);
}

export function isOwnerAccessError(error) {
  return error instanceof OwnerAccessError
    || (error instanceof ActionError && (error.code === 'UNAUTHORIZED' || error.code === 'NOT_FOUND'));
}
`
