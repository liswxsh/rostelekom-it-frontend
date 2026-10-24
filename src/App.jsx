import { useEffect, useState } from 'react';
import './App.css';
import { ApiError, postJson } from './api.js';

function formatPhone(value) {
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
  return `+${value.replace(/\D/g, '')}`;
}

function isValidPhone(value) {
  return /^\+7\d{10}$/.test(normalizePhone(value));
}

function FormError({ id, message, details }) {
  if (!message) return null;

  return (
    <div id={id} className="form-error" role="alert">
      <p>{message}</p>
      {details.length > 0 && (
        <ul>
          {details.map((detail) => <li key={detail}>{detail}</li>)}
        </ul>
      )}
    </div>
  );
}

function App() {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState([]);
  const [hasValidationError, setHasValidationError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return undefined;

    const timer = window.setTimeout(() => {
      setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds]);

  const requestCode = async (event) => {
    event.preventDefault();
    setError('');
    setErrorDetails([]);
    setHasValidationError(false);

    if (!isValidPhone(phone)) {
      setError('Введите номер полностью в формате +7 (999) 000-00-00');
      setHasValidationError(true);
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
      setStep('code');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.retryAfterSeconds > 0) {
        setRetryAfterSeconds(requestError.retryAfterSeconds);
      } else {
        setError(requestError.message);
        setErrorDetails(requestError instanceof ApiError ? requestError.details : []);
        setHasValidationError(requestError instanceof ApiError && requestError.status === 400);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setError('');
    setErrorDetails([]);
    setHasValidationError(false);

    if (!/^\d{6}$/.test(code)) {
      setError('Код подтверждения должен состоять из 6 цифр');
      setHasValidationError(true);
      return;
    }

    setIsLoading(true);

    try {
      const tokens = await postJson('/api/auth/otp/verify', {
        phone: normalizePhone(phone),
        code,
      });
      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      setStep('success');
    } catch (requestError) {
      setError(requestError.message);
      setErrorDetails(requestError instanceof ApiError ? requestError.details : []);
      setHasValidationError(requestError instanceof ApiError && requestError.status === 400);
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
    setHasValidationError(false);
    setRetryAfterSeconds(0);
  };

  const requestButtonText = retryAfterSeconds > 0
    ? `Повторить через ${retryAfterSeconds} сек.`
    : isLoading
      ? 'Отправляем…'
      : 'Получить код';

  return (
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
              <p>Введите номер телефона, привязанный к лицевому счёту</p>
            </div>

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
                  setHasValidationError(false);
                }}
                disabled={isLoading}
                aria-invalid={hasValidationError}
                aria-describedby={error ? 'phone-error' : undefined}
                required
                autoFocus
              />
              <FormError id="phone-error" message={error} details={errorDetails} />
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
                  setHasValidationError(false);
                }}
                disabled={isLoading}
                aria-invalid={hasValidationError}
                aria-describedby={error ? 'code-error' : undefined}
                required
                autoFocus
              />
              <FormError id="code-error" message={error} details={errorDetails} />
            </div>

            <button className="login-button" type="submit" disabled={isLoading}>
              {isLoading ? 'Проверяем…' : 'Войти'}
            </button>
          </form>
        )}

        {step === 'success' && (
          <section className="login-card success-card" aria-live="polite">
            <div className="success-icon" aria-hidden="true">✓</div>
            <h2>Вход выполнен</h2>
            <p>Вы успешно вошли в личный кабинет.</p>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
