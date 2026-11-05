import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { ApiError, getJson, postJson } from './api.js';
import './Dashboard.css';

const ACCOUNT_STATUSES = {
  ACTIVE: 'Активен',
  BLOCKED: 'Заблокирован',
  CLOSED: 'Закрыт',
};

const TRANSACTION_TYPES = {
  TOP_UP: { label: 'Пополнение', sign: '+', className: 'income' },
  CHARGE: { label: 'Списание', sign: '−', className: 'expense' },
  REFUND: { label: 'Возврат', sign: '+', className: 'income' },
};

function formatMoney(value, currency = 'RUB') {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatProfilePhone(phone = '') {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 11) return phone;
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  if (hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

function Dashboard({ onLogout }) {
  const [currentPage, setCurrentPage] = useState('home');
  const [profile, setProfile] = useState(null);
  const [account, setAccount] = useState(undefined);
  const [transactions, setTransactions] = useState([]);
  const [amount, setAmount] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const idempotencyKeyRef = useRef('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onLogout();
      return;
    }
    setError(requestError.message || 'Не удалось загрузить данные');
  }, [onLogout]);

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    setError('');

    try {
      const [user, userAccount] = await Promise.all([
        getJson('/api/users/me', { auth: true }),
        getJson('/api/billing/accounts/me', { auth: true }).catch((requestError) => {
          if (requestError instanceof ApiError && requestError.status === 404) return null;
          throw requestError;
        }),
      ]);

      setProfile(user);
      setAccount(userAccount);

      if (userAccount) {
        try {
          const history = await getJson('/api/billing/accounts/me/transactions?size=6', {
            auth: true,
          });
          setTransactions(history.content || []);
        } catch (historyError) {
          setTransactions([]);
          handleError(historyError);
        }
      } else {
        setTransactions([]);
      }
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (!notice) return undefined;

    const timer = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openAccount = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      await postJson('/api/billing/accounts', undefined, { auth: true });
      await loadData(false);
      setNotice('Лицевой счёт открыт');
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const topUpAccount = async (event) => {
    event.preventDefault();
    const normalizedAmount = amount.trim().replace(',', '.');

    if (!/^\d+(\.\d{1,2})?$/.test(normalizedAmount) || Number(normalizedAmount) <= 0) {
      setError('Введите сумму больше нуля, не более двух знаков после запятой');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setNotice('');

    let paymentKey = idempotencyKeyRef.current || idempotencyKey;
    if (!paymentKey) {
      paymentKey = crypto.randomUUID();
      idempotencyKeyRef.current = paymentKey;
      setIdempotencyKey(paymentKey);
    }

    try {
      const payment = await postJson(
        '/api/billing/payments',
        { amount: Number(normalizedAmount) },
        {
          auth: true,
          headers: { 'Idempotency-Key': paymentKey },
        },
      );

      if (payment.confirmationUrl?.startsWith('/api/')) {
        // Пока подтверждаем оплату через заглушку бэкенда
        await postJson(payment.confirmationUrl, undefined, { auth: true });
      } else if (payment.confirmationUrl) {
        window.location.assign(payment.confirmationUrl);
        return;
      }

      setAmount('');
      setIdempotencyKey('');
      idempotencyKeyRef.current = '';
      await loadData(false);
      setNotice('Баланс успешно пополнен');
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');

    try {
      if (refreshToken) await postJson('/api/auth/logout', { refreshToken });
    } catch {
      // Локальный выход должен работать, даже если сервер недоступен
    } finally {
      onLogout();
    }
  };

  if (isLoading) {
    return <div className="dashboard-loader">Загружаем личный кабинет…</div>;
  }

  const displayName = profile?.firstName || profile?.username || '';

  return (
    <div className="dashboard-page">
      <Helmet>
        <title>Главная</title>
      </Helmet>

      <header className="dashboard-header">
        <div className="header-content">
          <img className="dashboard-logo" src="/rostelecom-logo.png" alt="Ростелеком" />
          <nav className="dashboard-nav" aria-label="Навигация по странице">
            <button
              className={currentPage === 'home' ? 'nav-active' : ''}
              type="button"
              onClick={() => setCurrentPage('home')}
            >
              Главная
            </button>
            <button
              className={currentPage === 'tariffs' ? 'nav-active' : ''}
              type="button"
              onClick={() => setCurrentPage('tariffs')}
            >
              Тарифы
            </button>
          </nav>
          <div className="header-user">
            <div className="profile-avatar" aria-label="Профиль" title={formatProfilePhone(profile?.phone)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4.5 20C5.2 15.9 7.7 14 12 14C16.3 14 18.8 15.9 19.5 20" />
              </svg>
            </div>
            <button className="logout-button" type="button" onClick={logout}>Выйти</button>
          </div>
        </div>
      </header>

      <main id="dashboard" className="dashboard-main" hidden={currentPage !== 'home'}>
        <div className="welcome-row">
          <div>
            <p className="eyebrow">Личный кабинет</p>
            <h1>{getGreeting()}{displayName ? `, ${displayName}` : ''}!</h1>
            <p>Здесь можно проверить баланс и пополнить лицевой счёт.</p>
          </div>
          <button
            className="refresh-button"
            type="button"
            onClick={() => {
              setNotice('');
              loadData();
            }}
          >
            Обновить
          </button>
        </div>

        {error && <div className="dashboard-alert error-alert" role="alert">{error}</div>}
        {notice && <div className="dashboard-alert success-alert" role="status">{notice}</div>}

        {!account ? (
          <section className="empty-account-card">
            <div className="empty-account-icon">₽</div>
            <h2>У вас пока нет лицевого счёта</h2>
            <p>Откройте его, чтобы пополнять баланс и смотреть историю операций.</p>
            <button type="button" onClick={openAccount} disabled={isSubmitting}>
              {isSubmitting ? 'Открываем…' : 'Открыть счёт'}
            </button>
          </section>
        ) : (
          <>
            <div className="dashboard-grid">
              <section className="balance-card">
                <div className="balance-card-top">
                  <span>Текущий баланс</span>
                  <span className={`account-status status-${account.status?.toLowerCase()}`}>
                    {ACCOUNT_STATUSES[account.status] || account.status}
                  </span>
                </div>
                <strong className="balance-value">
                  {formatMoney(account.balance, account.currency)}
                </strong>
                <div className="account-number">
                  <span>Лицевой счёт</span>
                  <strong>{account.number}</strong>
                </div>
              </section>

              <section id="top-up" className="top-up-card">
                <div>
                  <p className="card-label">Пополнение</p>
                  <h2>Пополнить баланс</h2>
                  <p>Деньги поступят на лицевой счёт сразу после подтверждения.</p>
                </div>
                <form onSubmit={topUpAccount}>
                  <div className="amount-field">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="500"
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value.replace(/[^\d.,]/g, ''));
                        setIdempotencyKey('');
                        idempotencyKeyRef.current = '';
                        setError('');
                        setNotice('');
                      }}
                      aria-label="Сумма пополнения"
                      disabled={isSubmitting || account.status === 'CLOSED'}
                    />
                    <span>₽</span>
                  </div>
                  <button type="submit" disabled={isSubmitting || account.status === 'CLOSED'}>
                    {isSubmitting ? 'Подождите…' : 'Пополнить'}
                  </button>
                </form>
              </section>
            </div>

            <section id="transactions" className="transactions-card">
              <div className="section-heading">
                <div>
                  <p className="card-label">История</p>
                  <h2>Последние операции</h2>
                </div>
                <span>{transactions.length} из последних</span>
              </div>

              {transactions.length === 0 ? (
                <div className="empty-transactions">Операций пока нет</div>
              ) : (
                <div className="transactions-list">
                  {transactions.map((transaction) => {
                    const type = TRANSACTION_TYPES[transaction.type] || {
                      label: transaction.description || 'Операция',
                      sign: '',
                      className: '',
                    };

                    return (
                      <div className="transaction-row" key={transaction.id}>
                        <div className={`transaction-icon ${type.className}`}>{type.sign || '•'}</div>
                        <div className="transaction-info">
                          <strong>{transaction.description || type.label}</strong>
                          <span>{formatDate(transaction.createdAt)}</span>
                        </div>
                        <strong className={`transaction-amount ${type.className}`}>
                          {type.sign}{formatMoney(transaction.amount, account.currency)}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <main className="dashboard-main tariffs-page" hidden={currentPage !== 'tariffs'}>
        <p className="eyebrow">Услуги</p>
        <h1>Тарифы</h1>
        <section className="tariffs-empty">
          <h2>Тарифов пока нет</h2>
          <p>Доступные предложения появятся здесь позже.</p>
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
