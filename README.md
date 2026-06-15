# Tripstory POC

Solo MVP for validating the core loop:

1. Create a trip.
2. Upload up to 20 photos.
3. Click one button.
4. Generate a written narrative and a vertical recap video.

## Setup

```bash
npm install
cp .env.example .env
```

Add your OpenAI API key to `.env`.

If `OPENAI_API_KEY` is missing, the server returns a mock story so you can still test the app and video rendering loop.

You can also force the mock path with:

```bash
USE_MOCK_AI=true
```

## Run

Start the API:

```bash
npm run server
```

Start the mobile app:

```bash
npm start
```

Open the app in Expo Go.

## Important local network note

`App.tsx` currently points to:

```ts
const API_URL = "http://localhost:4000";
```

That works for web/simulator. For a physical phone, replace it with your computer's LAN IP, for example:

```ts
const API_URL = "http://192.168.1.20:4000";
```

## MVP Limitations

- Photos only, no video clips yet.
- One local API server, no accounts or cloud storage.
- Video is a simple vertical slideshow with generated captions.
- AI narration text is generated, but no voiceover audio yet.
