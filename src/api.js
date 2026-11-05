const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Если бэк не прислал detail, показываем свой текст
const STATUS_MESSAGES = {
  400: 'Проверьте введённые данные.',
  401: 'Необходимо войти в систему.',
  403: 'Недостаточно прав для выполнения действия.',
  404: 'Запрошенные данные не найдены.',
  409: 'Данные конфликтуют с уже существующими.',
  429: 'Слишком много запросов. Попробуйте позже.',
  500: 'На сервере произошла ошибка. Попробуйте позже.',
  502: 'Сервис временно недоступен. Попробуйте позже.',
  503: 'Сервис временно недоступен. Попробуйте позже.',
};

function extractErrorMessages(errors) {
  if (typeof errors === 'string') return [errors];

  // errors может прийти массивом или объектом с полями
  if (Array.isArray(errors)) {
    return errors.flatMap(extractErrorMessages);
  }

  if (errors && typeof errors === 'object') {
    return Object.values(errors).flatMap(extractErrorMessages);
  }

  return [];
}

function extractFieldErrors(errors) {
  if (Array.isArray(errors)) {
    return Object.assign({}, ...errors.map(extractFieldErrors));
  }

  if (!errors || typeof errors !== 'object') return {};

  return Object.fromEntries(
    Object.entries(errors)
      .map(([field, value]) => [field, extractErrorMessages(value)[0]])
      .filter(([, message]) => Boolean(message)),
  );
}

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status ?? 0;
    this.details = options.details ?? [];
    this.fieldErrors = options.fieldErrors ?? {};
    this.retryAfterSeconds = options.retryAfterSeconds ?? 0;
    this.instance = options.instance ?? '';
    this.reason = options.reason ?? '';
  }
}

function createApiError(response, data) {
  const problem = data && typeof data === 'object' ? data : {};
  const validationMessages = [...new Set(extractErrorMessages(problem.errors))];
  // Validation failed не показываем, если есть нормальный текст ошибки
  const readableDetail = problem.detail && problem.detail !== 'Validation failed'
    ? problem.detail
    : '';
  const message = readableDetail
    || validationMessages[0]
    || problem.message
    || STATUS_MESSAGES[response.status]
    || problem.title
    || 'Не удалось выполнить запрос. Попробуйте ещё раз.';

  return new ApiError(message, {
    status: response.status,
    details: validationMessages.filter((item) => item !== message),
    fieldErrors: extractFieldErrors(problem.errors),
    retryAfterSeconds: Number(
      problem.retryAfterSeconds || response.headers.get('Retry-After') || 0,
    ),
    instance: problem.instance,
    reason: problem.reason,
  });
}

let refreshPromise;

async function refreshTokens() {
  if (refreshPromise) return refreshPromise;

  const previousRefreshToken = localStorage.getItem('refreshToken');
  if (!previousRefreshToken) throw new ApiError('Необходимо войти в систему.', { status: 401 });

  const updateTokens = async () => {
    const currentRefreshToken = localStorage.getItem('refreshToken');

    // Другая вкладка уже успела обновить одноразовый refresh-токен
    if (currentRefreshToken !== previousRefreshToken) {
      return localStorage.getItem('accessToken');
    }

    let response;

    try {
      response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentRefreshToken }),
      });
    } catch {
      throw new ApiError(
        'Не удалось подключиться к серверу. Проверьте соединение и попробуйте ещё раз.',
      );
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw createApiError(response, data);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data.accessToken;
  };

  const refresh = navigator.locks
    ? navigator.locks.request('rostelekom-auth-refresh', updateTokens)
    : updateTokens();

  refreshPromise = refresh
    .catch((error) => {
      if (error instanceof ApiError && [400, 401].includes(error.status)) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      }
      throw error;
    })
    .finally(() => {
      refreshPromise = undefined;
    });

  return refreshPromise;
}

export async function requestJson(path, options = {}) {
  const {
    method = 'GET',
    body,
    auth = false,
    headers: customHeaders = {},
  } = options;
  const headers = { ...customHeaders };

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      'Не удалось подключиться к серверу. Проверьте соединение и попробуйте ещё раз.',
    );
  }

  const data = response.status === 204
    ? null
    : await response.json().catch(() => ({}));

  if (response.status === 401 && auth) {
    const accessToken = await refreshTokens();
    return requestJson(path, {
      ...options,
      auth: false,
      headers: { ...customHeaders, Authorization: `Bearer ${accessToken}` },
    });
  }

  if (!response.ok) {
    throw createApiError(response, data);
  }

  return data;
}

export function getJson(path, options = {}) {
  return requestJson(path, { ...options, method: 'GET' });
}

export function postJson(path, body, options = {}) {
  return requestJson(path, { ...options, method: 'POST', body });
}
