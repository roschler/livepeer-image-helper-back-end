// This test harness exercises the image creation assistant
//  prompt interaction with the LLM.

import fs from "fs"
import path from "node:path"
import { processImageChatVolley } from "../src/process-chat-volley"
import { getDefaultState } from "../src/chat-volleys/chat-volleys"

const errPrefix: string = '(test-directly-image-prompt) ';
const CONSOLE_CATEGORY = 'test-directly-image-prompt';

/**
 * Create a simple page to view the images created
 *  during the test harness session.
 *
 * @param imageUrls - The URLs to show on the page.
 */
function generateHTML(imageUrls: string[]) {
	const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Gallery</title>
  <style>
    body {
      font-family: Arial, sans-serif;
    }
    .image-row {
      margin-bottom: 20px;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <h1>Image Gallery</h1>
  ${imageUrls.map(url => `
    <div class="image-row">
      <img src="${url}" alt="Image from ${url}" />
    </div>
  `).join('')}
</body>
</html>
  `;
	return htmlContent;
}

// -------------------- END  : INTENT DETECTOR RESULT ARRAY HELPER FUNCTIONS ------------

if (true) {
	// Use an immediate invoked function expression, so that we
//  can await the result.
	(async () => {
		try {
			const dummyUserId = 'the_user';

			// const userInput = 'I want a sign on the wall that screams "Death to all dirty towels!';

			// const userInput = 'I want a sign that the car is not moving!'

			// const userInput = `The image lacks details.  Also, can you make it brighter and why is it taking so long?`;

			// const userInput = "I can't read the letters on the sign and it's a little too bright."

			// const userInput = "I want there to be a sentence on the side of the horse and can you make the images generate faster?"

			const userInput = "No I said I wanted the deer to be bright yellow, not blue and why is the image out of focus and too dark?  Also, I want the deer to be looking at the camera.  Also, the image is really unimaginative.";

			// processImageChatVolley needs a state object.
			const initialState = getDefaultState()

			const aryImageUrls =
				await processImageChatVolley(null, initialState, dummyUserId, userInput)

			// Generate the HTML
			const htmlContent = generateHTML(aryImageUrls);

			// Define the output file path
			const outputPath = path.join('C:', 'temp', 'image-gen-out.html');

			// Write the HTML to the file
			fs.writeFile(outputPath, htmlContent, 'utf8', (err) => {
				if (err) {
					console.error('Error writing file:', err);
				} else {
					console.log('HTML file successfully created at:', outputPath);
				}
			});

			console.info(CONSOLE_CATEGORY, `\nFinished.`)

			// console.info(CONSOLE_CATEGORY, `JSON response received:\n${result.json_response}`)
			// console.info(CONSOLE_CATEGORY, `Done`)
		} catch (err) {
			console.info(`${errPrefix}err object:`);
			console.dir(err, {depth: null, colors: true});
		}
	})();
}

// -------------------- END  : INTENT: IS_TEXT_WANTED_ON_IMAGE ------------

/*
// Use an immediate invoked function expression, so that we
//  can await the result.
(async () => {
	try {
		const thePrompt =
			'A green frog.'
		const result =
			await assistUserWithImageGeneration(thePrompt)

		console.info(`${errPrefix}result object:`);
		console.dir(result, {depth: null, colors: true});

		// Initialize the state flags to make extractOpenAiResponseDetails()
		//  happy.
		const state = {
			streaming_audio: false,
			streaming_text: false,
			waiting_for_images: false,
			current_request_id: "",
		};

		// extractOpenAiResponseDetails() requires a payload object
		//  with the following format.
		const payload =
			{
				prompt: thePrompt,
				textCompletionParams: g_TextCompletionParams
			}

		// Extract the accumulated text from the streamed response.
		const allText = await extractOpenAiResponseDetails(
			state,
			result,
			null,
			payload
		)

		console.info(CONSOLE_CATEGORY, `allText received:\n${allText}`)
		console.info(CONSOLE_CATEGORY, `Done`)
	} catch (err) {
		console.info(`${errPrefix}err object:`);
		console.dir(err, {depth: null, colors: true});
	}
})();
*/