import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import './App.css';
import { ApiError, postJson } from './api.js';
import Dashboard from './Dashboard.jsx';

function formatPhone(value) {
  // Маска собирается по мере ввода цифр
  let digits = value.replace(/\D/g, '');

  if (!digits) return '';

  if (digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  } else if (!digits.startsWith('7')) {
    digits = `7${digits}`;
  }

  digits = digits.slice(0, 11);
  const number = digits.slice(1);

  if (!number) return '+7';

  let formatted = `+7 (${number.slice(0, 3)}`;
  if (number.length >= 3) formatted += ')';
  if (number.length > 3) formatted += ` ${number.slice(3, 6)}`;
  if (number.length > 6) formatted += `-${number.slice(6, 8)}`;
  if (number.length > 8) formatted += `-${number.slice(8, 10)}`;

  return formatted;
}

function normalizePhone(value) {
  // На бэк номер уходит без скобок и дефисов
  return `+${value.replace(/\D/g, '')}`;
}

function isValidPhone(value) {
  return /^\+7\d{10}$/.test(normalizePhone(value));
}

function isValidName(value, required = true) {
  const name = value.trim();
  if (!name) return !required;
  return /^[\p{Lu}][\p{L}]*(?:[ '\u2019-][\p{Lu}][\p{L}]*)*$/u.test(name)
    && name.length <= 100;
}

function formatName(value) {
  return value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/(^|[ '\u2019-])\p{L}/gu, (part) => part.toLocaleUpperCase('ru-RU'));
}

function FormError({ id, message, details = [] }) {
  if (!message) return null;

  return (
    <div id={id} className="form-alert" role="alert">
      <p>{message}</p>
      {details.length > 0 && (
        <ul>
          {details.map((detail) => <li key={detail}>{detail}</li>)}
        </ul>
      )}
    </div>
  );
}

function FieldError({ id, message }) {
  if (!message) return null;
  return <p id={id} className="field-error" role="alert">{message}</p>;
}

function App() {
  const [step, setStep] = useState('phone');
  const [isAuthenticated, setIsAuthenticated] = useState(
    Boolean(localStorage.getItem('accessToken')),
  );
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [registrationToken, setRegistrationToken] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');

  const showRequestError = (requestError) => {
    const receivedErrors = requestError instanceof ApiError ? requestError.fieldErrors : {};
    const visibleFields = ['phone', 'code', 'lastName', 'firstName', 'middleName'];
    const errors = Object.fromEntries(
      Object.entries(receivedErrors).filter(([field]) => visibleFields.includes(field)),
    );
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setError('');
      setErrorDetails([]);
    } else {
      setError(requestError.message || 'Не удалось выполнить запрос');
      setErrorDetails(requestError instanceof ApiError ? requestError.details : []);
    }
  };

  useEffect(() => {
    if (retryAfterSeconds <= 0) return undefined;

    // Уменьшаем Retry-After раз в секунду
    const timer = window.setTimeout(() => {
      setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds]);

  const requestCode = async (event) => {
    event.preventDefault();
    setError('');
    setErrorDetails([]);
    setFieldErrors({});

    if (!isValidPhone(phone)) {
      setFieldErrors({ phone: 'Введите номер полностью: +7 (999) 000-00-00' });
      return;
    }

    setIsLoading(true);

    try {
      const challenge = await postJson('/api/auth/otp/request', {
        phone: normalizePhone(phone),
      });
      setPhone(formatPhone(challenge.phone || phone));
      setDevCode(challenge.code || '');
      setCode('');
      setRetryAfterSeconds(Number(challenge.resendAfterSeconds) || 0);
      setStep('code');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.retryAfterSeconds > 0) {
        setRetryAfterSeconds(requestError.retryAfterSeconds);
      } else {
        showRequestError(requestError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resendCode = async () => {
    setError('');
    setErrorDetails([]);
    setFieldErrors({});
    setIsLoading(true);

    try {
      const challenge = await postJson('/api/auth/otp/request', {
        phone: normalizePhone(phone),
      });
      setDevCode(challenge.code || '');
      setCode('');
      setRetryAfterSeconds(Number(challenge.resendAfterSeconds) || 0);
    } catch (requestError) {
      showRequestError(requestError);
      if (requestError instanceof ApiError && requestError.retryAfterSeconds > 0) {
        setRetryAfterSeconds(requestError.retryAfterSeconds);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setError('');
    setErrorDetails([]);
    setFieldErrors({});

    if (!/^\d{6}$/.test(code)) {
      setFieldErrors({ code: 'Введите шестизначный код' });
      return;
    }

    setIsLoading(true);

    try {
      const result = await postJson('/api/auth/otp/verify', {
        phone: normalizePhone(phone),
        code,
      });

      if (result.registrationToken) {
        setRegistrationToken(result.registrationToken);
        setStep('register');
      } else {
        saveTokens(result);
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.reason === 'NOT_REQUESTED') {
        changePhone();
        setError(requestError.message);
        return;
      }

      if (requestError instanceof ApiError && requestError.status === 400) {
        setError('');
        setErrorDetails([]);
        setFieldErrors({
          code: requestError.fieldErrors.code || requestError.message,
        });
      } else {
        showRequestError(requestError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const saveTokens = (tokens) => {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    setIsAuthenticated(true);
  };

  const register = async (event) => {
    event.preventDefault();
    setError('');
    setErrorDetails([]);
    setFieldErrors({});

    const formattedLastName = formatName(lastName);
    const formattedFirstName = formatName(firstName);
    const formattedMiddleName = formatName(middleName);

    setLastName(formattedLastName);
    setFirstName(formattedFirstName);
    setMiddleName(formattedMiddleName);

    const nameErrors = {};
    if (!isValidName(formattedLastName)) {
      nameErrors.lastName = 'Начните фамилию с заглавной буквы';
    }
    if (!isValidName(formattedFirstName)) {
      nameErrors.firstName = 'Начните имя с заглавной буквы';
    }
    if (!isValidName(formattedMiddleName, false)) {
      nameErrors.middleName = 'Начните отчество с заглавной буквы';
    }

    if (Object.keys(nameErrors).length > 0) {
      setFieldErrors(nameErrors);
      return;
    }

    setIsLoading(true);

    try {
      const tokens = await postJson('/api/auth/register', {
        registrationToken,
        lastName: formattedLastName,
        firstName: formattedFirstName,
        middleName: formattedMiddleName || null,
      });
      saveTokens(tokens);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.reason === 'NOT_REQUESTED') {
        changePhone();
        setError(requestError.message);
        return;
      }
      showRequestError(requestError);
    } finally {
      setIsLoading(false);
    }
  };

  const changePhone = () => {
    setStep('phone');
    setCode('');
    setDevCode('');
    setError('');
    setErrorDetails([]);
    setFieldErrors({});
    setRetryAfterSeconds(0);
    setRegistrationToken('');
  };

  const requestButtonText = retryAfterSeconds > 0
    ? `Повторить через ${retryAfterSeconds} сек.`
    : isLoading
      ? 'Отправляем…'
      : 'Получить код';

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setIsAuthenticated(false);
    setStep('phone');
    setPhone('');
    setCode('');
    setDevCode('');
    setError('');
    setErrorDetails([]);
    setFieldErrors({});
    setIsLoading(false);
    setRetryAfterSeconds(0);
    setRegistrationToken('');
    setFirstName('');
    setLastName('');
    setMiddleName('');
  }, []);

  if (isAuthenticated) {
    return <Dashboard onLogout={logout} />;
  }

  return (
    <>
      <Helmet>
        <title>{step === 'register' ? 'Регистрация' : 'Вход'}</title>
      </Helmet>

      <main className="login-page">
        <section className="promo-section">
        <img className="logo" src="/rostelecom-logo.png" alt="Ростелеком" />

        <div className="promo-content">
          <h1>
            Управляйте услугами связи
            <br />
            в одном месте
          </h1>
          <p className="promo-description">
            Проверяйте баланс, оплачивайте услуги
            <br />
            и обращайтесь в поддержку онлайн
          </p>
          <ul className="advantages">
            <li><span className="check">✓</span><span>Интернет, ТВ и телефония</span></li>
            <li><span className="check">✓</span><span>История платежей и начислений</span></li>
            <li><span className="check">✓</span><span>Круглосуточная техническая поддержка</span></li>
          </ul>
        </div>

        <div className="decorative-circle circle-left"></div>
        <div className="decorative-circle circle-right"></div>
      </section>

      <section className="form-section">
        {step === 'phone' && (
          <form className="login-card" onSubmit={requestCode} noValidate>
            <div className="form-heading">
              <h2>Вход в личный кабинет</h2>
              <p>Введите номер телефона. Для нового номера регистрация откроется после подтверждения кода</p>
            </div>

            <FormError id="phone-form-error" message={error} details={errorDetails} />

            <div className="login-fields">
              <label className="field-label" htmlFor="phone">Номер телефона</label>
              <input
                id="phone"
                className="form-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 (999) 000-00-00"
                pattern="\+7 \([0-9]{3}\) [0-9]{3}-[0-9]{2}-[0-9]{2}"
                title="Введите номер полностью: +7 (999) 000-00-00"
                maxLength={18}
                value={phone}
                onChange={(event) => {
                  setPhone(formatPhone(event.target.value));
                  setError('');
                  setErrorDetails([]);
                  setFieldErrors((current) => ({ ...current, phone: '' }));
                }}
                disabled={isLoading}
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                required
                autoFocus
              />
              <FieldError id="phone-error" message={fieldErrors.phone} />
            </div>

            <button
              className="login-button"
              type="submit"
              disabled={isLoading || retryAfterSeconds > 0}
            >
              {requestButtonText}
            </button>

          </form>
        )}

        {step === 'code' && (
          <form className="login-card" onSubmit={verifyCode} noValidate>
            <div className="form-heading">
              <h2>Введите код из СМС</h2>
              <p>Код отправлен на <strong>{phone}</strong></p>
              <button className="change-phone-button" type="button" onClick={changePhone}>
                Изменить номер
              </button>
            </div>

            <FormError id="code-form-error" message={error} details={errorDetails} />

            <div className="login-fields">
              {devCode && (
                <p className="dev-code" role="status">
                  Код для тестового входа: <strong>{devCode}</strong>
                </p>
              )}
              <label className="field-label" htmlFor="sms-code">Код подтверждения</label>
              <input
                id="sms-code"
                className="form-input sms-code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, ''));
                  setError('');
                  setErrorDetails([]);
                  setFieldErrors((current) => ({ ...current, code: '' }));
                }}
                disabled={isLoading}
                aria-invalid={Boolean(fieldErrors.code)}
                aria-describedby={fieldErrors.code ? 'code-error' : undefined}
                required
                autoFocus
              />
              <FieldError id="code-error" message={fieldErrors.code} />
            </div>

            <button className="login-button" type="submit" disabled={isLoading}>
              {isLoading ? 'Проверяем…' : 'Продолжить'}
            </button>
            <button
              className="resend-code-button"
              type="button"
              onClick={resendCode}
              disabled={isLoading || retryAfterSeconds > 0}
            >
              {retryAfterSeconds > 0
                ? `Отправить код повторно через ${retryAfterSeconds} сек.`
                : 'Отправить код повторно'}
            </button>
          </form>
        )}

        {step === 'register' && (
          <form className="login-card registration-card" onSubmit={register} noValidate>
            <div className="form-heading">
              <h2>Создание аккаунта</h2>
              <p>Номер <strong>{phone}</strong> подтверждён. Заполните данные профиля</p>
            </div>

            <FormError id="registration-error" message={error} details={errorDetails} />

            <div className="login-fields registration-fields">
              <label className="field-label" htmlFor="last-name">Фамилия</label>
              <input
                id="last-name"
                className="form-input"
                autoComplete="family-name"
                autoCapitalize="words"
                maxLength={100}
                placeholder="Иванов"
                value={lastName}
                onChange={(event) => {
                  setLastName(event.target.value);
                  setError('');
                  setErrorDetails([]);
                  setFieldErrors((current) => ({ ...current, lastName: '' }));
                }}
                onBlur={() => setLastName(formatName(lastName))}
                disabled={isLoading}
                aria-invalid={Boolean(fieldErrors.lastName)}
                aria-describedby={fieldErrors.lastName ? 'last-name-error' : undefined}
                required
                autoFocus
              />
              <FieldError id="last-name-error" message={fieldErrors.lastName} />

              <label className="field-label" htmlFor="first-name">Имя</label>
              <input
                id="first-name"
                className="form-input"
                autoComplete="given-name"
                autoCapitalize="words"
                maxLength={100}
                placeholder="Иван"
                value={firstName}
                onChange={(event) => {
                  setFirstName(event.target.value);
                  setError('');
                  setErrorDetails([]);
                  setFieldErrors((current) => ({ ...current, firstName: '' }));
                }}
                onBlur={() => setFirstName(formatName(firstName))}
                disabled={isLoading}
                aria-invalid={Boolean(fieldErrors.firstName)}
                aria-describedby={fieldErrors.firstName ? 'first-name-error' : undefined}
                required
              />
              <FieldError id="first-name-error" message={fieldErrors.firstName} />

              <label className="field-label" htmlFor="middle-name">Отчество <span>(необязательно)</span></label>
              <input
                id="middle-name"
                className="form-input"
                autoComplete="additional-name"
                autoCapitalize="words"
                maxLength={100}
                placeholder="Иванович"
                value={middleName}
                onChange={(event) => {
                  setMiddleName(event.target.value);
                  setError('');
                  setErrorDetails([]);
                  setFieldErrors((current) => ({ ...current, middleName: '' }));
                }}
                onBlur={() => setMiddleName(formatName(middleName))}
                disabled={isLoading}
                aria-invalid={Boolean(fieldErrors.middleName)}
                aria-describedby={fieldErrors.middleName ? 'middle-name-error' : undefined}
              />
              <FieldError id="middle-name-error" message={fieldErrors.middleName} />
            </div>

            <button className="login-button" type="submit" disabled={isLoading}>
              {isLoading ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
            </button>
          </form>
        )}

        </section>
      </main>
    </>
  );
}

export default App;
