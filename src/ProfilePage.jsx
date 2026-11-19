import { formatMoney, formatDate, formatProfilePhone } from './formatters.js';
import './ProfilePage.css';

function ProfilePage({
  hidden, profile, account, activeSubscription, suspendedSubscriptions,
  isSubscriptionsLoading, subscriptionsError,
}) {
  const fullName = [profile?.lastName, profile?.firstName, profile?.middleName]
    .filter(Boolean)
    .join(' ') || 'Имя пользователя';
  const tariffStatus = subscriptionsError
    ? { label: 'Недоступно', color: 'neutral' }
    : isSubscriptionsLoading
      ? { label: 'Загружаем', color: 'neutral' }
      : activeSubscription
        ? { label: 'Подключён', color: 'active' }
        : suspendedSubscriptions.length
          ? { label: 'Приостановлен', color: 'suspended' }
          : { label: 'Не подключён', color: 'neutral' };

  return (
      <main className="dashboard-main profile-page" hidden={hidden}>
        <div className="profile-heading">
          <div>
            <p className="eyebrow">Профиль</p>
            <h1>Личные данные</h1>
            <p>Здесь можно посмотреть данные вашего аккаунта.</p>
          </div>
        </div>

        <section className="profile-summary">
          <div className="profile-large-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" />
              <path d="M4.5 20C5.2 15.9 7.7 14 12 14C16.3 14 18.8 15.9 19.5 20" />
            </svg>
          </div>
          <div>
            <p className="profile-summary-label">Пользователь</p>
            <h2>{fullName}</h2>
            <p>{formatProfilePhone(profile?.phone) || 'Номер телефона не указан'}</p>
          </div>
        </section>

        <div className="profile-grid">
          <section className="profile-card">
            <p className="card-label">Тариф</p>
            <div className="profile-tariff-heading">
              <h2>Текущий тариф</h2>
              <span className={`profile-tariff-status profile-tariff-status-${tariffStatus.color}`}>
                {tariffStatus.label}
              </span>
            </div>
            {subscriptionsError ? (
              <p className="profile-muted">{subscriptionsError}</p>
            ) : isSubscriptionsLoading ? (
              <p className="profile-muted">Проверяем подключённые тарифы…</p>
            ) : activeSubscription ? (
              <div className="profile-tariff-placeholder">
                <span className="profile-tariff-icon">⌁</span>
                <div>
                  <strong>{activeSubscription.tariffName}</strong>
                  <p>{formatMoney(activeSubscription.price, activeSubscription.currency)} в месяц · Следующее списание {formatDate(activeSubscription.nextChargeAt)}</p>
                </div>
              </div>
            ) : suspendedSubscriptions.length > 0 ? (
              <div className="profile-tariff-placeholder">
                <span className="profile-tariff-icon">!</span>
                <div>
                  <strong>Оплаченного тарифа пока нет</strong>
                  <p>Ожидают оплаты: {suspendedSubscriptions.map((item) => item.tariffName).join(', ')}. Отмените ненужные тарифы на странице тарифов.</p>
                </div>
              </div>
            ) : (
              <div className="profile-tariff-placeholder">
                <span className="profile-tariff-icon">⌁</span>
                <div>
                  <strong>Здесь появится ваш тариф</strong>
                  <p>Название, стоимость и дата следующего списания будут отображаться после подключения.</p>
                </div>
              </div>
            )}
          </section>

          <section className="profile-card profile-account-card">
            <p className="card-label">Лицевой счёт</p>
            <h2>{account ? 'Номер лицевого счёта' : 'Счёт не открыт'}</h2>
            {account ? (
              <strong className="profile-account-number">{account.number}</strong>
            ) : <p className="profile-muted">Откройте лицевой счёт на главной странице, чтобы пополнять баланс и пользоваться услугами.</p>}
          </section>
        </div>

        <a className="profile-card profile-coverage-card" href="https://msk.rt.ru/map_mvno" target="_blank" rel="noopener noreferrer">
          <div className="profile-coverage-content">
            <span className="profile-coverage-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
            </span>
            <div>
              <p className="card-label">Мобильная связь</p>
              <h2>Карта покрытия</h2>
              <p>Посмотрите, где доступен мобильный интернет Ростелекома.</p>
            </div>
          </div>
          <span className="profile-coverage-link">
            Открыть карту покрытия
            <span aria-hidden="true">↗</span>
          </span>
        </a>
      </main>

  );
}

export default ProfilePage;
