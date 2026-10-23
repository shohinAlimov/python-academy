# Python Задачи · shohin's Academy

Сайт с задачами по Python, аккаунтами (логин + пароль), профилями и общим просмотром решений.
Стек: Node.js + Express + MongoDB.

## Запуск

1. Создайте бесплатную базу в MongoDB Atlas (cloud.mongodb.com) → Connect → Drivers → скопируйте строку подключения.
   В Atlas → Network Access добавьте свой IP (или 0.0.0.0/0 для хостинга).
2. Скопируйте `.env.example` в `.env` и заполните:
   - `MONGODB_URI` — строка из Atlas (после `.net/` укажите имя базы, например `python_academy`)
   - `JWT_SECRET` — длинная случайная строка. Сгенерировать: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
3. Установите и запустите:
   ```
   npm install
   npm start
   ```
4. Откройте http://localhost:3000

Локально можно вместо Atlas поставить MongoDB Community и указать `mongodb://127.0.0.1:27017/python_academy`.

## Страницы
`index.html` главная · `topic.html?t=vars` задачи темы · `people.html` сообщество ·
`profile.html` свой профиль · `profile.html?u=логин` чужой профиль · `login.html` вход и регистрация.

## Как это устроено
- Пароли хранятся как bcrypt-хеш, вход — httpOnly-cookie с JWT на 30 дней.
- Коллекции: `users` (логин, хеш, имя, аватар, о себе, счётчик решённых) и `solutions` (userId, номер задачи, код, время).
- Ограничения: 10 регистраций в час и 10 попыток входа за 15 минут с одного IP; код до 20 000 символов.
- Код других пользователей показывается только как текст (HTML экранируется).

## Выкладка в интернет
Подойдёт любой хостинг Node.js (Render, Railway, Fly.io): задайте `MONGODB_URI`, `JWT_SECRET` и `NODE_ENV=production`
(включает secure-cookie, нужен HTTPS). Команда запуска: `npm start`.

## Чего пока нет
Восстановления пароля (почта не собирается): если пароль забыт, удалите пользователя в Atlas или задайте новый хеш вручную.
