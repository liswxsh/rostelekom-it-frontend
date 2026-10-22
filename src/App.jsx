import { useState } from 'react';
import './App.css';

function App() {
  const [loginType, setLoginType] = useState('email');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="login-page">
      <section className="promo-section">
        <img
          className="logo"
          src="/rostelecom-logo.png"
          alt="Ростелеком"
        />

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
            <li>
              <span className="check">✓</span>
              <span>Интернет, ТВ и телефония</span>
            </li>

            <li>
              <span className="check">✓</span>
              <span>История платежей и начислений</span>
            </li>

            <li>
              <span className="check">✓</span>
              <span>Круглосуточная техническая поддержка</span>
            </li>
          </ul>
        </div>

        <div className="decorative-circle circle-left"></div>
        <div className="decorative-circle circle-right"></div>
      </section>

      <section className="form-section">
        <form
          className="login-card"
          onSubmit={(event) => event.preventDefault()}
        >
          <h2>Вход в личный кабинет</h2>

          <div className="login-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={loginType === 'phone'}
              className={`tab ${
                loginType === 'phone' ? 'tab-active' : ''
              }`}
              onClick={() => setLoginType('phone')}
            >
              Телефон
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={loginType === 'email'}
              className={`tab ${
                loginType === 'email' ? 'tab-active' : ''
              }`}
              onClick={() => setLoginType('email')}
            >
              Электронная почта
            </button>
          </div>

          <input
            key={loginType}
            className="form-input"
            type={loginType === 'phone' ? 'tel' : 'email'}
            placeholder={
              loginType === 'phone'
                ? '+7 999 000-00-00'
                : 'example@mail.ru'
            }
          />

          <label className="password-label" htmlFor="password">
            Пароль
          </label>

          <div className="password-field">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="********"
            />

            <button
              className="eye-button"
              type="button"
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2 12C3.7 7.8 7.3 5 12 5C16.7 5 20.3 7.8 22 12C20.3 16.2 16.7 19 12 19C7.3 19 3.7 16.2 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3L21 21" />
                  <path d="M10.6 10.7A2 2 0 0 0 13.3 13.4" />
                  <path d="M9.9 4.2C10.6 4.1 11.3 4 12 4C17 4 20.3 8 21 12C20.8 13.2 20.3 14.4 19.6 15.4" />
                  <path d="M6.2 6.2C4.5 7.5 3.4 9.5 3 12C3.7 16 7 20 12 20C13.5 20 14.8 19.6 15.9 19" />
                </svg>
              )}
            </button>
          </div>

          <div className="form-options">
            <label className="remember">
              <input type="checkbox" />
              <span>Запомнить меня</span>
            </label>

            <a href="#">Забыли пароль?</a>
          </div>

          <button className="login-button" type="submit">
            Войти
          </button>

          <p className="register-text">
            Ещё нет аккаунта?{' '}
            <a href="#">Зарегистрироваться</a>
          </p>
        </form>
      </section>
    </main>
  );
}

export default App;