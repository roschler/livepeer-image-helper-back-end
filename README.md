# livepeer-image-helper-back-end
This is the repository for the server side code for Livepeer Image Entry, contest entry into the SambaNova Lightning Fast IA hackathon.  The app's primary feature is S.C.A.R.P., which stands for Self-Correcting Auto-Refined Prompts. It leverages SambaNova's Llama text and video models to automatically enhance stable diffusion image generation prompts, resolving issues with generated images and aligning the content more closely with the user's desired outcome. This process eliminates the need for users to have prior knowledge of stable diffusion models or the complex parameters associated with them.

To run this code you will need the following environment variables to have appropriate values:

- Your SambaNova API ID must be found in an environment variable with this name

INFER_ALL_AI_API_ID

- Your SambaNova API KEY must be found in an environment variable with this name

INFER_ALL_AI_API_KEY

- If you want to mint Story Protocol NFTs, your Pinata JWT token value must be found in an environment variable with this name

PINATA_JWT

- If you want to post tweets to Twitter with your AI generated images you will need an environment variable with this name, set to your web server host name with protocol (E.g. - https://mydomain.com)

TWITTER_CARD_BASE_URL



