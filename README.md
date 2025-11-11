<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1m0FbM1A8TMVoNUMIVle1pNeXdk7yU7GH

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key.
3. Add Google Custom Search credentials to [.env.local](.env.local):
   ```bash
   GOOGLE_SEARCH_API_KEY=your_google_api_key
   GOOGLE_SEARCH_ENGINE_ID=your_custom_search_engine_id
   ```
   *If you already use a `GOOGLE_SEARCH_CX` value, it will be used as a fallback for the engine ID.*
4. Run the app:
   `npm run dev`
