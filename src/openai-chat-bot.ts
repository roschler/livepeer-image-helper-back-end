import { chatCompletionImmediate } from "./openai-common"
import { OpenAIParams_text_completion } from "./openai-parameter-objects"
import { getCurrentOrAncestorPathForSubDirOrDie, readTextFile } from "./common-routines"
import path from "node:path"
import fs from "fs"
import {
	enumIntentDetectorId_image_assistant,
	enumIntentDetectorId_license_assistant
} from "./intents/enum-intents"
import { ChatHistory, CurrentChatState_license_assistant, StringOrNull } from "./chat-volleys/chat-volleys"

const CONSOLE_CATEGORY = 'open-ai-chat-bot'

// -------------------- BEGIN: TYPES AND INTERFACES ------------

/**
 * A simple interface type for grouping a user prompt and a
 *  system prompt.
 */
export interface UserAndSystemPrompt {
	userPrompt: string,
	systemPrompt: string
}

// -------------------- END  : TYPES AND INTERFACES ------------

// -------------------- BEGIN: TEXT COMPLETION PARAMETER OBJECTS ------------

// The text completion parameter object for chatbot text
//  completion calls, initialized to the default starting
//  values.  (Note, they will change over time as we help
//  the user create better generative AI images).
export const g_TextCompletionParams =
	// Chatbot app wants text completions streamed to it.
	new OpenAIParams_text_completion();

// The text completion parameters object for intent detector
//  calls.
export const g_TextCompletionParamsForIntentDetector =
	new OpenAIParams_text_completion({
		// Getting 400 unsupported value errors for o1-mini
		// model_param_val: 'o1-mini'
		model_param_val: 'gpt-4-turbo'
		// model_param_val: 'gpt-4'
	})

// The text completion parameters object for making calls with
//  the o1-mini model, the fast reasoning model.
export const g_TextCompletionParamsLicenseAssistant =
	new OpenAIParams_text_completion({
		// Getting 400 unsupported value errors for o1-mini
		// model_param_val: 'o1-mini'
		// model_param_val: 'gpt-4-turbo'
		model_param_val: 'gpt-4',
		temperature_param_val: 0.4
	})


// -------------------- END  : TEXT COMPLETION PARAMETER OBJECTS ------------

// -------------------- BEGIN: LOAD PROMPT BUILDER TEXT FILES ------------

// We need to load the system, tips, and perhaps other source files
//  from disk first, since they are used to build the full prompt
//  passed to the LLM, along with the user's input.

const DIR_FOR_IMAGE_GENERATION_PROMPTS = 'prompts-for-text-completions'

/**
 * Load one of our image generation sub-prompt files.  If the
 *  source file can not be found in our directory for those, or
 *  if there is a problem loading it, an error is thrown.
 *
 * @param {String} primaryFileName - The primary file name of the
 *  source file to load.
 *
 * @return {String} Returns the text content found in the source
 *  file.
 */
export function readImageGenerationSubPromptOrDie(primaryFileName: string) {
	// Check for existence of needed subdirectory.
	const resolvedFilePath =
		getCurrentOrAncestorPathForSubDirOrDie(CONSOLE_CATEGORY, DIR_FOR_IMAGE_GENERATION_PROMPTS);

	const fullFilePath = path.join(resolvedFilePath, primaryFileName);

	if (!fs.existsSync(fullFilePath)) {
		// We may be running in production.  Check one
		//  sub-directory upwards.

		throw new Error(`Unable to find image generation sub-prompt using file name:\n${fullFilePath}`);
	}

	const textContent = readTextFile(fullFilePath);

	if (textContent === null)
		throw new Error(`Unable to load image generation sub-prompt using file name:\n${primaryFileName}`);

	return textContent;
}

/**
 * Given a chat h istory object  and the current license assistant PilTerms,
 *  session state, create a chat history summary.
 *
 * @param chatHistoryObj - The chat history object for the current
 *  user.
 * @param bIsStartNewLicenseTermsSession - If TRUE, then
 *  the user wants to craft a completely new license, otherwise
 *  we are continuing to build an existing one.
 * @param numMessages - The number of the most recent
 *  chat history messages to include.  -1 means give me
 *  everything.
 *
 * @return Returns the system prompt to use in the
 *  upcoming text completion call.
 */
export function buildChatHistorySummary(
		chatHistoryObj: ChatHistory,
		bIsStartNewLicenseTermsSession: boolean,
		numMessages: number = -1): StringOrNull {
	// Extract the most recent chat history and create
	//  a block of plain text from it.
	//
	// IMPORTANT!: This variable name must match the one used
	//  in the system prompt text file!
	// const chatHistorySummaryAsText =
	//	chatHistoryObj.buildChatHistoryPrompt()

	let strChatHistory: StringOrNull = null;

	if (!bIsStartNewLicenseTermsSession) {
		// Get the last chat volley.
		// const lastChatVolleyObj = chatHistoryObj.getLastVolley()

		// Build the chat history.
		const strChatHistory_local =
			// -1 means we want everything available.  Since we
			//  start a new session with each new NFT, the chat
			//  histories should not be too long.
			chatHistoryObj.buildChatHistoryPrompt(numMessages);

		if (strChatHistory_local.length > 0)
			strChatHistory = strChatHistory_local;
	}

	return strChatHistory
}

// -------------------- BEGIN: INTENT TO PROMPT TEXT MAPPING ------------

// This array maps all the intents we created to the
//  LLM text completion prompt text that is associated
//  with the intent, and the primary name of the
//  resource that has the prompt text.
const g_AryIntentPrompts_image_assistant:
	{ [key: string]:
			{
				primary_resource_name: string,
				prompt_text: string }} = {};

const g_AryIntentPrompts_license_assistant:
	{ [key: string]:
		{
			primary_resource_name: string,
				prompt_text: string }} = {};

// -------------------- BEGIN: IMAGE ASSISTANT INTENTS ------------

// Assign the correct resource name to each intent.

// >>>>> INTENT: IS_TEXT_WANTED_ON_IMAGE
g_AryIntentPrompts_image_assistant[enumIntentDetectorId_image_assistant.IS_TEXT_WANTED_ON_IMAGE] =
	{
		primary_resource_name: "intent-detector-is-text-wanted-on-image.txt",
		prompt_text: ""
	};

// >>>>> INTENT: START_NEW_IMAGE
g_AryIntentPrompts_image_assistant[enumIntentDetectorId_image_assistant.START_NEW_IMAGE] =
	{
		primary_resource_name: "intent-start-new-image.txt",
		prompt_text: ""
	};

// >>>>> INTENT: USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT
g_AryIntentPrompts_image_assistant[enumIntentDetectorId_image_assistant.USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT] =
	{
		primary_resource_name: "intent-user-complaint-image-quality-or-content.txt",
		prompt_text: ""
	};

// >>>>> INTENT: USER_COMPLAINT_IMAGE_GENERATION_SPEED
g_AryIntentPrompts_image_assistant[enumIntentDetectorId_image_assistant.USER_COMPLAINT_IMAGE_GENERATION_SPEED] =
	{
		primary_resource_name: "intent-user-complaint-image-generation-too-slow.txt",
		prompt_text: ""
	};

// We iterate over all the intent values known to the system
//  at this time to make sure that every one of them has a
//  corresponding prompt resource, and then we load that into
//  our array of intent prompts.
for (const intentId of Object.values(enumIntentDetectorId_image_assistant)) {
	if (typeof g_AryIntentPrompts_image_assistant[intentId] === 'undefined')
		throw new Error(`Unable to find a prompt entry for image assistant intent ID: "${intentId}"`);

	const primaryResourceName: string =
		g_AryIntentPrompts_image_assistant[intentId].primary_resource_name;

	if (primaryResourceName.length < 1)
		throw new Error(`The primary resource name is empty for intent ID: "${intentId}"`);

	// Load the prompt text.
	const promptText: string =
		readImageGenerationSubPromptOrDie(primaryResourceName);

	const trimmedPromptText = promptText.trim();

	if (trimmedPromptText.length < 1)
		throw new Error(`The prompt text resource is empty for image assistant intent ID: "${intentId}"`);

	// Success.  Store the prompt text.
	g_AryIntentPrompts_image_assistant[intentId].prompt_text = trimmedPromptText;

	console.info(CONSOLE_CATEGORY, `Successfully initialized prompt text for image assistantintent ID: "${intentId}"`)
}

// -------------------- END  : IMAGE ASSISTANT INTENTS ------------

// -------------------- BEGIN: LICENSE ASSISTANT INTENTS ------------

// >>>>> INTENT: DETERMINE_USER_INPUT_TYPE
g_AryIntentPrompts_license_assistant[enumIntentDetectorId_license_assistant.DETERMINE_USER_INPUT_TYPE] =
	{
		primary_resource_name: "intent-detector-question-or-form-fill-reply.txt",
		prompt_text: ""
	};

// Load it.
g_AryIntentPrompts_license_assistant[enumIntentDetectorId_license_assistant.DETERMINE_USER_INPUT_TYPE].prompt_text =
	readImageGenerationSubPromptOrDie(
		g_AryIntentPrompts_license_assistant[enumIntentDetectorId_license_assistant.DETERMINE_USER_INPUT_TYPE].primary_resource_name);


// >>>>> INTENT: DETECT_USER_INPUT_AS_LICENSE_TERM
g_AryIntentPrompts_license_assistant[enumIntentDetectorId_license_assistant.DETECT_USER_INPUT_AS_LICENSE_TERM] =
	{
		primary_resource_name: "intent-detector-user-reply-to-license-term.txt",
		prompt_text: ""
	};

// Load it.
g_AryIntentPrompts_license_assistant[enumIntentDetectorId_license_assistant.DETECT_USER_INPUT_AS_LICENSE_TERM].prompt_text =
	readImageGenerationSubPromptOrDie(
		g_AryIntentPrompts_license_assistant[enumIntentDetectorId_license_assistant.DETECT_USER_INPUT_AS_LICENSE_TERM].primary_resource_name);

// -------------------- END  : LICENSE ASSISTANT INTENTS ------------

/**
 * This is a kludge to search all the intent prompt arrays for
 *  a particular intent ID, and then return the prompt text
 *  associated.
 *
 *  TODO: Do this in a structured manner.
 *
 * @param intentId - The ID of the desired intent.
 *
 * @returns - Returns the prompt text for the desired intent
 *  if that intent is found, NULL if no such intent with
 *  the given ID exists.
 */
function findIntentPromptText(intentId: string): StringOrNull {
	if (intentId in g_AryIntentPrompts_image_assistant) {
		return g_AryIntentPrompts_image_assistant[intentId].prompt_text.trim()
	}

	if (intentId in g_AryIntentPrompts_license_assistant) {
		return g_AryIntentPrompts_license_assistant[intentId].prompt_text.trim()
	}

	return null
}

console.info(CONSOLE_CATEGORY, `All image assistant intents initialized.`)


/**
 * Execute a text completion call for the desired intent
 *  using the latest input from the user.
 *
 * @param {String} intentId - The ID of the desired intent.
 * @param {OpenAIParams_text_completion} textCompletionParams -
 *  A valid OpenAI text completion parameters object.
 * @param {String} userInput - The latest input from the user.
 *
 * @returns {Promise<
 * 	{
 * 		intent_detector_id: string,
 * 		is_error: boolean,
 * 		error_message: string,
 * 		text_response: string,
 * 		json_response: object
 * 		date_time_of_response: number}>
 * 	}
 *
 *  An object containing the fields above that comprise the
 *   text completion response is returned.  Note, the
 *   date_time_of_response field is a Unix timestamp.
 */
export async function executeIntentCompletion(
		intentId: string,
		textCompletionParams: OpenAIParams_text_completion,
		userInput: string) {

	const trimmedUserInput: string = userInput.trim();

	if (trimmedUserInput.length < 1)
		throw new Error(`The user input is empty`);

	const intentPromptText = findIntentPromptText(intentId);

	if (!intentPromptText  || intentPromptText.length < 1)
		throw new Error(`The intent prompt text is empty`);

	return await chatCompletionImmediate(
		intentId,
		intentPromptText,
		userInput,
		textCompletionParams,
		true)
}

/**
 * Processes multiple intent completions in parallel.
 *
 * @param {string[]} aryIntentIds - An array of intent IDs to be processed.
 * @param {OpenAIParams_text_completion} textCompletionsParams - The parameters to be passed to executeIntentCompletion.
 * @param {string} userInput - The user input that is required for the execution of intents.
 *
 * @returns {Promise<Array<{ is_error: boolean, intent_id: string, result_or_error: any }>>} - Returns an array of objects where each object contains error or success status, the intentId, and the result or error object from the respective execution.
 */
export async function processAllIntents(
	aryIntentIds: string[],
	textCompletionsParams: OpenAIParams_text_completion,
	userInput: string
): Promise<Array<{ is_error: boolean, intent_id: string, result_or_error: any }>> {

	// Validate that aryIntentIds has at least one non-empty element
	if (!Array.isArray(aryIntentIds) || aryIntentIds.length === 0) {
		throw new Error('aryIntentIds must be a non-empty array of intent IDs.');
	}

	// Validate that userInput is not empty after trimming
	if (typeof userInput !== 'string' || userInput.trim().length === 0) {
		throw new Error('userInput must be a non-empty string.');
	}

	// Validate that all intent IDs in aryIntentIds are valid
	/*
	const invalidIntents = aryIntentIds.filter(id => !isValidEnumIntentDetectorId_image_assistant(id));
	if (invalidIntents.length > 0) {
		throw new Error(`Invalid intent IDs found: ${invalidIntents.join(', ')}`);
	}
	 */

	// Use Promise.all to execute all intents in parallel
	const promises = aryIntentIds.map(async (intentId) => {
		try {
			const result =
				await executeIntentCompletion(
					intentId,
					textCompletionsParams,
					userInput);
			return { is_error: false, intent_id: intentId, result_or_error: result }; // Successful result
		} catch (error) {
			return { is_error: true, intent_id: intentId, result_or_error: error }; // Capture error in the result object
		}
	});

	// Wait for all promises to resolve
	return Promise.all(promises);
}

/**
 * Logs the contents of an array of intent result objects to the console.
 *
 * @param {Array<{ is_error: boolean, intent_id: string, result_or_error: any }>} aryIntentResultObjs -
 * An array of objects representing the intent results. Each object contains the following fields:
 *   - is_error: A boolean indicating if the result is an error.
 *   - intent_id: The ID of the intent.
 *   - result_or_error: The result object or error object associated with the intent.
 *
 * The function will log each object's contents in a pretty-printed format.
 */
export function showIntentResultObjects(
	aryIntentResultObjs: Array<{ is_error: boolean, intent_id: string, result_or_error: any }>
): void {
	aryIntentResultObjs.forEach((obj, index) => {
		console.log(`\nIntent Result Object #${index + 1}:`);
		console.log('Intent ID:', obj.intent_id);

		if (obj.is_error) {
			// Pretty-print the entire result_or_error if it's an error
			console.log('Error:', JSON.stringify(obj.result_or_error, null, 2));
		} else {
			// Show only specific fields if no error
			const { intent_detector_id, text_response, json_response } = obj.result_or_error;
			console.log('Intent Detector ID:', intent_detector_id);
			console.log('Text Response:', text_response);

			if (Array.isArray(json_response)) {
				console.log(`ARRAY JSON RESPONSE.  Number of elements: ${json_response.length}`);
			}

			console.log('JSON Response:', JSON.stringify(json_response, null, 2)); // Pretty-print the JSON response
		}
	});
}

// -------------------- END  : INTENT TO PROMPT TEXT MAPPING ------------

// This is the main system prompt uses to generate images.
export const g_MainImageGenerationSystemPrompt =
	readImageGenerationSubPromptOrDie('system-prompt-for-image-generation-1.txt');

// Load the tips we got from Discord members on generating images.
export const g_TipsFromDiscordMembersPrompt =
	readImageGenerationSubPromptOrDie('image-generation-tips-from-discord-members.txt')

// Load the main document we have that contains the main image generation
//  FAQ content, but use the variant that does not have video specific
//  tips in it or tips related to tweaking parameters or changing
//  models, since we have the intent detectors and regular code
//  to handle that.
export const g_MainImageGenerationFaqPrompt =
	readImageGenerationSubPromptOrDie('main-image-improvement-tips-and-guidelines-document-no-parameter-tips.txt')

// We use a dedicated wrong content prompt for user input
//  that points out specific wrong content errors because
//  the lesser intent detector that generates wrong
//  content detections misses things.
export const g_ExtendedWrongContentPrompt =
	readImageGenerationSubPromptOrDie('intent-user-complaint-extended-wrong-content.txt')

// We use a dedicated wrong content prompt for creating
//  the text for a good tweet that is based on the
//  last image generation prompt.
export const g_ImageGenPromptToTweetPrompt =
	readImageGenerationSubPromptOrDie('image-generation-prompt-to-tweet.txt')

// -------------------- END  : LOAD PROMPT BUILDER TEXT FILES ------------

/**
 * Given a user prompt and the current image generation parameters,
 *  create a new image generation prompt for the image assistant.
 *
 * @param userPrompt - The current prompt from the user.
 * @param chatHistoryObj - The chat history object for the current
 *  user.
 * @param wrongContentText - If the user complained about
 *  wrong content, pass the text matched here.  Otherwise,
 *  pass null if there was no such complaint.
 * @param bIsStartNewImage - If TRUE, then the user wants to
 *  start a completely new image, so we won't pass in the
 *  last image generation prompt to the image prompt LLM.
 *  Otherwise, we consider this the continuation of an
 *  existing image session and we will pass it.
 *
 * @return Returns the system prompt to use in the
 *  upcoming text completion call.
 */
export function buildChatBotSystemPrompt_image_assistant(
		userPrompt: string,
		wrongContentText: string | null,
		chatHistoryObj: ChatHistory,
		bIsStartNewImage: boolean): string {
	// IMPORTANT!: This variable name must match the one used
	//  in the system prompt text file!
	const useUserPrompt = userPrompt.trim();

	if (useUserPrompt.length < 1)
		throw new Error(`The user prompt is empty.`);

	console.info(CONSOLE_CATEGORY, `Current user prompt: ${userPrompt}`);

	// Extract the most recent chat history and create
	//  a block of plain text from it.
	//
	// IMPORTANT!: This variable name must match the one used
	//  in the system prompt text file!
	// const chatHistorySummaryAsText =
	//	chatHistoryObj.buildChatHistoryPrompt()

	// IMPORTANT!: This variable name must match the one used
	//  in the system prompt text file!
	let previousImageGenerationPromptOrNothing = ''

	if (!bIsStartNewImage) {
		// Get the last chat volley.
		const lastChatVolleyObj =
			chatHistoryObj.getLastVolley()

		if (lastChatVolleyObj) {
			// Build the last prompt information the LLM needs to
			//  modify the existing content.
			previousImageGenerationPromptOrNothing =
				`
					Here is the previous image generation prompt you created:\n
					${lastChatVolleyObj.prompt}\n
				`
			if (lastChatVolleyObj.negative_prompt.length > 0) {
				previousImageGenerationPromptOrNothing +=
					`
							Here is the previous negative prompt you created:\n
							${lastChatVolleyObj.negative_prompt}
						`
			}

			// Did the user complain about wrong content?
			if (wrongContentText === null) {
				// STUB
			} else {
				// -------------------- BEGIN: REWRITE AROUND WRONG CONTENT ------------
				if (wrongContentText.trim().length < 1)
					throw new Error(`The wrongContentText parameter is not NULL, so it can not be empty`);

				console.info(CONSOLE_CATEGORY, `>>>>>> Adding rewrite for wrong content text to system prompt.`)

				previousImageGenerationPromptOrNothing +=
					`
					Rewrite this image generation prompt so that the subject in the user's complaint, "${wrongContentText}", becomes the focus of the scene described by your revised image prompt.
					`
				// -------------------- END  : REWRITE AROUND WRONG CONTENT ------------
			}
		}
	}

	const adornedUserPrompt =
		`Here is the current user input.  Use it to guide the improvements to your revised prompt:\n${useUserPrompt}\n`

	// Build the full prompt from our sub-prompts.
	const arySubPrompts = [];

	// Not using this prompt for now.  Needs curation.
	// arySubPrompts.push(g_TipsFromDiscordMembersPrompt)

	// Main image generation system prompt.  Use it as a
	//  template string so that we can insert the needed values
	//  in the right place.

	// NOTE: Because they are only found in the system
	//  prompt eval string, the IDE will incorrectly
	//  flag them as unused variables.
	const evalStrMainSystemPrompt =
		'`' + g_MainImageGenerationSystemPrompt + '`';

	const evaluatedSystemPrompt =
		eval(evalStrMainSystemPrompt)

	arySubPrompts.push(evaluatedSystemPrompt)

	// Main tips document.
	arySubPrompts.push(g_MainImageGenerationFaqPrompt)

	return arySubPrompts.join(' ')
}

/**
 * Given a user prompt and the current license assistant PilTerms,
 *  create a license terms generation prompt for the license assistant.
 *
 * @param userPrompt - The current prompt from the user.
 * @param subAssistantName - The name of the sub-assistant
 *  selected to handle this chat volley.
 * @param subAssistantPromptText - The prompt text to use
 *  for the selected sub-assistant.
 * @param chatHistoryObj - The chat history object for the current
 *  user.
 * @param bIsStartNewLicenseTermsSession - If TRUE, then
 *  the user wants to craft a completely new license, otherwise
 *  we are continuing to build an existing one.
 * @param numMessages - The number of the most recent chat
 *  messages to include in the prompt.  -1 means give me everything
 *
 * @return Returns the system prompt to use in the
 *  upcoming text completion call.
 */
export function buildChatBotSystemPrompt_license_assistant(
		userPrompt: string,
		subAssistantName: string,
		subAssistantPromptText: string,
		chatHistoryObj: ChatHistory,
		bIsStartNewLicenseTermsSession: boolean,
		numMessages: number = -1): UserAndSystemPrompt {
	const useUserPrompt = userPrompt.trim();

	if (useUserPrompt.length < 1)
		throw new Error(`The user prompt is empty.`);

	if (subAssistantName.length < 1)
		throw new Error(`The sub-assistant name is empty.`);

	if (subAssistantPromptText.length < 1)
		throw new Error(`The sub-assistant prompt text is empty.`);

	console.info(CONSOLE_CATEGORY, `Current user prompt: ${userPrompt}`);
	console.info(CONSOLE_CATEGORY, `Sub-assistant name: ${subAssistantName}`);

	let strChatHistory =
		buildChatHistorySummary(chatHistoryObj, bIsStartNewLicenseTermsSession, numMessages);

	// IMPORTANT!: This variable name must match the one used
	//  in the system prompt text file!
	let pilTermsFieldDescriptionsObject =
		// We start with a PilTerms object in the default state.
		CurrentChatState_license_assistant.createDefaultObject().pilTerms;

	if (bIsStartNewLicenseTermsSession) {
		// Add a question or the license assistant form fill
		//  agent gets confused if you just say "yes" for
		//  the first user input, because it has no context.
		strChatHistory += '\nDo you know what kind of a license you need?\n';

	} else {
		// Get the last chat volley.
		const lastChatVolleyObj =
			chatHistoryObj.getLastVolley()

		if (lastChatVolleyObj && lastChatVolleyObj.chat_state_at_end_license_assistant) {
			pilTermsFieldDescriptionsObject =
				lastChatVolleyObj.chat_state_at_end_license_assistant.pilTerms;
		}
	}

	// Initialize the adorned user prompt.
	// let adornedUserPrompt = '\nHere is the current state of the PilTerms object you are building:\n';

	let adornedUserPrompt = '';

	// We always pass in a PilTerms object, since it controls
	//  the dialogue flow.
	// Append the current PilTerms ob ject.
	adornedUserPrompt +=
		'\nCURRENT LICENSE TERMS OBJECT:\n';

	adornedUserPrompt += JSON.stringify(pilTermsFieldDescriptionsObject)

	// TODO: Testing license assistant without chat history.
	// Do we have any chat history?
	if (strChatHistory)
		// Yes. Add the chat history.
		adornedUserPrompt += strChatHistory;

	// Append the most recently received user input.
	adornedUserPrompt +=
		`\n${useUserPrompt}\n`;

	// Build the full prompt from our sub-prompts.
	const arySubPrompts = [];

	arySubPrompts.push(subAssistantPromptText)

	// We don't add the user prompt to the system prompt,
	//  otherwise we don't take advantage of prompt caching
	//  by the LLM provider.
	// arySubPrompts.push(adornedUserPrompt)

	const systemPrompt = arySubPrompts.join(' ')

	return {
		systemPrompt: systemPrompt,
		userPrompt: adornedUserPrompt
	}
}



