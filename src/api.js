const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

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

  if (Array.isArray(errors)) {
    return errors.flatMap(extractErrorMessages);
  }

  if (errors && typeof errors === 'object') {
    return Object.values(errors).flatMap(extractErrorMessages);
  }

  return [];
}

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status ?? 0;
    this.details = options.details ?? [];
    this.retryAfterSeconds = options.retryAfterSeconds ?? 0;
    this.instance = options.instance ?? '';
  }
}

function createApiError(response, data) {
  const problem = data && typeof data === 'object' ? data : {};
  const validationMessages = [...new Set(extractErrorMessages(problem.errors))];
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
    retryAfterSeconds: Number(
      problem.retryAfterSeconds || response.headers.get('Retry-After') || 0,
    ),
    instance: problem.instance,
  });
}

export async function postJson(path, body) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      'Не удалось подключиться к серверу. Проверьте соединение и попробуйте ещё раз.',
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw createApiError(response, data);
  }

  return data;
}
