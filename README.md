# EmberTools App

A real mobile app + backend MVP for a South African business toolkit.

## What it does

- Register/login
- Invoice generator
- Quote generator
- CV generator
- Cover letter generator
- Contract generator
- Saves generated documents
- Paid plan checkout using Yoco hosted checkout
- PostgreSQL database
- Expo Android app ready for Play Store build

## Important

Do not put real Yoco secret keys inside GitHub.
Use `.env` on your server/Render/Railway.

## Backend setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env
npm run db
npm start
```

## Mobile setup

```bash
cd mobile
npm install
# edit API_URL in App.js and app.json
npx expo start
```

## Android build

```bash
npm install -g eas-cli
eas login
eas build -p android --profile production
```

Upload the generated `.aab` to Google Play Console.

## Yoco

Set the webhook URL in Yoco to:

```txt
https://YOUR_BACKEND_URL/api/yoco-webhook
```

Use test keys first, then live keys.
