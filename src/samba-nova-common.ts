// This module contains common code used in interacting with
//  SambaNova's cloud services.

import { extractTopBracketedContent, getEnvironmentVarOrError, getUnixTimestamp } from "./common-routines"
import { SambaNovaParams_text_completion, SambaNovaParams_vision_recognition } from "./samba-nova-parameter-objects"
import axios, { AxiosResponse } from "axios"
import { ImagePackage } from "./image-processing/image-handling"
import { jsonrepair } from "jsonrepair"
// import OpenAI from "./samba-nova-ai-substitutes"
import ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam
// import { Chat } from "./samba-nova-ai-substitutes/resources"
import ChatCompletionCreateParamsNonStreaming = Chat.ChatCompletionCreateParamsNonStreaming
import ChatCompletion = Chat.ChatCompletion
import { extractJsonFieldsWithTolerance, PropertyDetailsArrayOrNull } from "./json/json-custom-parse"
import OpenAI from "openai"
import Chat = OpenAI.Chat

export const DEFAULT_SAMBA_NOVA_BASE_URL = "https://api.sambanova.ai/v1";
export const SAMBA_NOVA_TEXT_COMPLETIONS_URL = DEFAULT_SAMBA_NOVA_BASE_URL + "/chat/completions"
// Default SambaNova text completion model.
export const DEFAULT_SAMBA_NOVA_TEXT_COMPLETION_MODEL_ID = 'Meta-Llama-3.1-8B-Instruct';
// Default SambaNova vision recognition model.
// More powerful model: Llama-3.2-90B-Vision-Instruct
export const DEFAULT_SAMBA_NOVA_VISION_RECOGNITION_MODEL_ID ='Llama-3.2-11B-Vision-Instruct';

// -------------------- BEGIN: TEXT COMPLETION RESPONSE INTERFACE ------------

// This interface describes the object we build from the OpenAI
//  text completion response and pass around the application.
export interface SambaNovaTextCompletionResponse {
	/**
	 * The ID of the intent the text completion is for.
	 */
	intent_detector_id: string;

	/**
	 * TRUE if an error occurred during the text completion call,
	 *  FALSE if not.
	 */
	is_error: boolean;

	/**
	 * If an error occurred, the error details will be put in this
	 *  property.
	 */
	error_message: string;

	/**
	 * The response received for the text completion call in
	 *  pure text format.
	 */
	text_response: string;

	/**
	 * The response received for the text completion call in
	 *  JSON format, if the call was marked as expecting a JSON
	 *  object response from the text completion call.
	 */
	json_response: object;

	/**
	 * The date/time the response was received in Unix timestamp
	 *  format.
	 */
	date_time_of_response: number;
}

// -------------------- END  : TEXT COMPLETION RESPONSE INTERFACE ------------

// -------------------- BEGIN: UTILITY FUNCTIONS ------------

/**
 * Removes invalid property declarations from a JSON string.
 * Invalid properties are defined as lines that contain only a single double quote `"`
 * immediately followed by a comma `,`, possibly with whitespace.
 *
 * @param strJson - The JSON string to be processed.
 * @returns The cleaned JSON string with invalid properties removed.
 *          If no invalid properties are found, the original string is returned.
 * @throws Error if `strJson` is not a non-empty string.
 */
function removeInvalidChildProperties(strJson: string): string {
	if (typeof strJson !== "string" || strJson.trim() === "") {
		throw new Error("Input must be a non-empty string.");
	}

	// Regular expression to find invalid property declarations.
	// Matches lines that contain only a double quote, optional whitespace, and a comma.
	const regex = /^\s*"\s*,\s*(\r?\n|$)/gm;

	// Remove all occurrences of the invalid property declarations.
	const cleanedStrJson = strJson.replace(regex, "");

	return cleanedStrJson;
}


/**
 * This function will make sure that string that is
 *  supposed to be a JSON object is properly formed.
 *  Sometimes the LLM throws in comments into a JSON
 *  object which are not allowed, or forgets to double-quote
 *  all property names.
 *
 * @param strJsonObj - A JSON object in string format.
 */
function conformJsonObjectString(strJsonObj: string): string {
	// Sometimes the engine throws in some text
	//  outside and around the JSON object or array of
	//  JSON objects.  This function removes
	//  that unwanted, out-of-band text.
	function removeOutOfBandText(strJsonObj: string): string {
		const braceIndex = strJsonObj.indexOf('{');
		const bracketIndex = strJsonObj.indexOf('[');

		if (braceIndex === -1 && bracketIndex === -1) {
			// Return the original string if no braces or brackets were found
			return strJsonObj;
		}

		// Determine the starting index of the JSON content
		const firstIndex = (braceIndex === -1) ? bracketIndex :
			(bracketIndex === -1) ? braceIndex :
				Math.min(braceIndex, bracketIndex);

		const openChar = strJsonObj[firstIndex];
		const closeChar = openChar === '{' ? '}' : ']';

		let count = 0;
		for (let i = firstIndex; i < strJsonObj.length; i++) {
			if (strJsonObj[i] === openChar) {
				count++;
			} else if (strJsonObj[i] === closeChar) {
				count--;
				if (count === 0) {
					// Found the matching closing brace/bracket
					return strJsonObj.substring(firstIndex, i + 1);
				}
			}
		}

		// If no matching closing brace/bracket is found, return from the first brace/bracket to the end
		return strJsonObj.substring(firstIndex);
	}


	// Step 1: Remove out-of-band text.
	const withoutOutOfBandText =
		removeOutOfBandText(strJsonObj);

	// Step 2: Remove comments (single-line and multi-line)
	const withoutComments = withoutOutOfBandText
		.replace(/\/\/.*(?=\n|\r)/g, '') // Remove single-line comments
		.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

	// Step 3: Ensure all property names are surrounded by double quotes
	const withProperQuotes = withoutComments.replace(
		/([a-zA-Z0-9_]+)\s*:/g, // Matches unquoted keys followed by colon
		'"$1":' // Surround the key with double quotes
	);

	// Step 3: Return the string
	return withProperQuotes;
}

/**
 * Sometimes it is necessary to do substantial conditioning
 *  of the text output from an LLM that should contain
 *  JSON output as part of the response string.
 *
 * @param textResponse - The text response from an LLM.
 * @param aryPropertyDetailsOrNull - If provided, then
 *  we will use our custom JSON parsing function to
 *  parse the LLM text response.  Otherwise, we will
 *  use generic repair methods.
 */
function superFixLlmJsonOutput(textResponse: string, aryPropertyDetailsOrNull: PropertyDetailsArrayOrNull): string {

	if (aryPropertyDetailsOrNull === null) {
		// Sometimes the LLM throws in comments outside
		//  the square brackets for an array of JSON
		//  objects.
		const textResponseCleaned =
			extractTopBracketedContent(textResponse);

		const useTextResponse =
			textResponseCleaned
				? textResponseCleaned
				: textResponse;

		const conformedTextResponse =
			conformJsonObjectString(useTextResponse);

		// Apply json repair in case the LLM output
		//  is malformed.
		const repairedTextResponse =
			jsonrepair(conformedTextResponse);

		console.log(`*** JSON.PARSE ***. Parsing response text in repairedTextResponse:\n\n${repairedTextResponse}`);

		// This function fixes a specific problem where the
		//  LLM emits JSON with invalid child property
		//  declarations with a single double-quote followed
		//  by a command.
		const finalFixedTextResponse =
			removeInvalidChildProperties(repairedTextResponse);

		return finalFixedTextResponse;
	} else {
		// If the caller provided a property details
		//  array, use our custom function that
		//  takes advantage of that information to do a
		//  custom JSON parse.
		const returnedObj =
			extractJsonFieldsWithTolerance(
				aryPropertyDetailsOrNull,
				textResponse);

		return JSON.stringify(returnedObj);
	}
}

// -------------------- END  : UTILITY FUNCTIONS ------------

// -------------------- BEGIN: VISION RECOGNITION RESPONSE INTERFACE ------------

// This interface describes the object we build from the OpenAI
//  vision recognition response and pass around the application.
export interface SambaNovaVisionRecognitionResponse {
	/**
	 * The ID of the intent the vision recognition is for.
	 */
	intent_detector_id: string;


	/**
	 * The external URL to the source image used in the vision
	 *  recognition operation.
	 */
	url_to_source_image: string;

	/**
	 * TRUE if an error occurred during the vision recognition call,
	 *  FALSE if not.
	 */
	is_error: boolean;

	/**
	 * If an error occurred, the error details will be put in this
	 *  property.
	 */
	error_message: string;

	/**
	 * The response received for the vision recognition call in
	 *  pure text format.
	 */
	text_response: string;

	/**
	 * The response received for the vision recognition call in
	 *  JSON format, if the call was marked as expecting a JSON
	 *  object response from the vision recognition call.
	 */
	json_response: object;

	/**
	 * The date/time the response was received in Unix timestamp
	 *  format.
	 */
	date_time_of_response: number;
}

// -------------------- END  : VISION RECOGNITION RESPONSE INTERFACE ------------

/**
 * This call makes a non-streaming text completion call to the LLM.
 *
 * @param {string} intentDetectorId - The ID of the intent detector
 *  making the call. This must not be empty.
 * @param {string} systemPrompt - The prompt to use in the system role.
 * @param {string} userInput - The latest input from the user, to be
 *  included with the system prompt.
 * @param {SambaNovaParams_text_completion} textCompletionParams - A valid
 *  SambaNova text completion call parameters object.
 * @param {boolean} bIsJsonResponseExpected - Set this to TRUE if
 *  the LLM is supposed to return a JSON object as its response,
 *  FALSE if you expect a pure text response.
 * @param aryPropertyDetailsOrNull - If provided, then
 *  we will use our custom JSON parsing function to
 *  parse the LLM text response.  Otherwise, we will
 *  use generic repair methods.
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
export async function sambaNovaChatCompletionImmediate(
		intentDetectorId: string,
		systemPrompt: string,
		userInput: string,
		textCompletionParams: SambaNovaParams_text_completion,
		bIsJsonResponseExpected: boolean,
		aryPropertyDetailsOrNull: PropertyDetailsArrayOrNull): Promise<SambaNovaTextCompletionResponse> {
	if (!intentDetectorId) {
		throw new Error("The intentDetectorId must not be empty.");
	}

	const sambaNovaApiKey =
		getEnvironmentVarOrError("SAMBANOVA_API_KEY");

	/*
		Full prompt is quite long.

		console.log(`Creating chat completion (non-streaming) with system prompt: ${systemPrompt}`);
		console.log(`User prompt: ${userInput}`);
	 */

	const messages = [
		{
			role: "system",
			content: systemPrompt,
		},
		{
			role: "user",
			content: userInput,
		},
	] as ChatCompletionMessageParam[];

	try {
		// TODO: Currently we do not use SambaNova's custom properties
		//  when making a completion call because those field names
		//  are not found in the OpenAI ChatCompletionCreateParamsNonStreaming
		//  declaration.  Add these later.
		//
		/*
		// Call OpenAI's text completion API endpoint (non-streaming).
		const response = await oai.chat.completions.create({
			model: textCompletionParams.model_param_val,
			messages,
			// NOTE: Currently this parameter is ignored.  Use the repetition
			//  penalty instead.
			frequency_penalty: textCompletionParams.frequency_penalty_param_val,
			// NOTE: Currently this parameter is ignored.  Use the repetition
			//  penalty instead.
			presence_penalty: textCompletionParams.presence_penalty_param_val,
			stream: false, // Set stream to false for immediate response
			temperature: textCompletionParams.temperature_param_val,
			max_tokens: textCompletionParams.max_tokens_param_val,
			top_p: textCompletionParams.top_p_param_val,
			// response_format:  { "type": "json_object" }
		});
		 */

		// Going around OpenAI NPM package because we are having
		//  trouble with it currently.  It gives us errors saying
		//  we have given it an invalid model ID or that we don't
		//  have access to that model I.
		const axiosResponse: AxiosResponse = await axios.post(
			SAMBA_NOVA_TEXT_COMPLETIONS_URL,
			{
				messages: messages,
				// stop: ["<|eot_id|>"],
				model: textCompletionParams.model_param_val, // "Meta-Llama-3.1-8B-Instruct",
				stream: false,
				stream_options: { include_usage: true },
				temperature: textCompletionParams.temperature_param_val,
				max_tokens: textCompletionParams.max_tokens_param_val
			} as ChatCompletionCreateParamsNonStreaming,
			{
				headers: {
					"Authorization": `Bearer ${sambaNovaApiKey}`,
					"Content-Type": "application/json"
				}
			}
		);

		if (!axiosResponse.data)
			throw new Error(`The AXIOS response is missing a "data" property.`);

		let response: ChatCompletion = axiosResponse.data as ChatCompletion;

		let textResponse = '';
		let jsonResponse = {};

		// Aggregate text response text elements
		textResponse =
			response.choices?.map(
				(choice) =>
					choice.message?.content).join(' ') || '';

		let conformedTextResponse;

		let superFixedJsonOutput = '(none)';

		if (bIsJsonResponseExpected) {
			try {
				superFixedJsonOutput =
					superFixLlmJsonOutput(textResponse, aryPropertyDetailsOrNull);

				console.log(`superFixedJsonOutput:\n${superFixedJsonOutput}`);


				// We should be able to parse the text response into
				//  an object.
				console.log(`Parsing superFixedJsonOutput now...`);
				jsonResponse = JSON.parse(superFixedJsonOutput);
			} catch (parseError) {
				return {
					intent_detector_id: intentDetectorId,
					is_error: true,
					error_message: `Fatal JSON parse error: ${parseError.message}.\nsuperFixedJsonOutput:\n${superFixedJsonOutput}`,
					text_response: textResponse,
					json_response: {},
					date_time_of_response: getUnixTimestamp(),
				};
			}
		}

		return {
			intent_detector_id: intentDetectorId,
			is_error: false,
			error_message: '',
			text_response: textResponse,
			json_response: jsonResponse,
			date_time_of_response: getUnixTimestamp(),
		};
	} catch (error: any) {
		// Error handling
		const errorMessage = error?.response?.data?.error?.message || error.message || "Unknown error occurred";
		const statusCode = error?.response?.status || 'Unknown status code';

		return {
			intent_detector_id: intentDetectorId,
			is_error: true,
			error_message: `Error ${statusCode}: ${errorMessage}`,
			text_response: '',
			json_response: {},
			date_time_of_response: getUnixTimestamp(),
		};
	}
}

/**
 * This is a direct call to the SambaNova API without using the
 *  OpenAI client, since we are having trouble with that avenue
 *  currently.
 *
 * @param baseUrl
 * @param apiKey
 */
async function testSambaNova(baseUrl: string, apiKey: string) {
	try {
		const response = await axios.post(
			baseUrl,
			{
				messages: [
					{ role: "system", content: "Answer the question in a couple sentences." },
					{ role: "user", content: "Share a happy story with me" }
				],
				stop: ["<|eot_id|>"],
				model: "Meta-Llama-3.1-8B-Instruct",
				stream: false,
				stream_options: { include_usage: true }
			},
			{
				headers: {
					"Authorization": `Bearer ${apiKey}`,
					"Content-Type": "application/json"
				}
			}
		);

		return response.data;
	} catch (error) {
		console.error("Error:", error);
		throw error;
	}
}

// -------------------- BEGIN: VISION MODELS ------------

/**
 * This call makes a non-streaming vision recognition call to the LLM.
 *
 * @param intentId - The ID of the intent detector
 *  making the call.  This must not be empty.
 * @param systemPromptForVisionRecognition - The system prompt
 *  for the vision recognition call.
 * @param visionCompletionParams - A valid SambaNova vision
 *  recognition call parameters object.
 * @param urlToSourceImage - The external URL to the original
 *  source image.  It will be passed back in the result
 *  object.
 * @param base64EncodedImageString - The image data in base 64
 *  encoded string format.
 * @param bIsJsonResponseExpected - Set this to TRUE if
 *  the LLM is supposed to return a JSON object as its response,
 *  FALSE if you expect a pure text response.
 * @param aryPropertyDetailsOrNull - If provided, then
 *  we will use our custom JSON parsing function to
 *  parse the LLM text response.  Otherwise, we will
 *  use generic repair methods.
 *
 * @returns - Returns a SambaNovaTextCompletionResponse response
 *  object with the result details of the operation.
 */
export async function sambaNovaVisionRecognitionImmediate(
	intentId: string,
	systemPromptForVisionRecognition: string,
	visionCompletionParams: SambaNovaParams_vision_recognition,
	urlToSourceImage: string,
	base64EncodedImageString: string,
	bIsJsonResponseExpected: boolean,
	aryPropertyDetailsOrNull: PropertyDetailsArrayOrNull
): Promise<SambaNovaVisionRecognitionResponse> {
	if (intentId.length < 1) {
		throw new Error("The intentId parameter must not be empty.");
	}

	if (urlToSourceImage.length < 1) {
		throw new Error("The urlToSourceImage parameter must not be empty.");
	}

	const sambaNovaApiKey =
		getEnvironmentVarOrError("SAMBANOVA_API_KEY");

	// This function will make sure that string that is
	//  supposed to be a JSON object is properly formed.
	//  Sometimes the LLM throws in comments into a JSON
	//  object which are not allowed, or forgets to double-quote
	//  all property names.
	function conformJsonObjectString(strJsonObj: string): string {
		// Sometimes the engine throws in some text
		//  outside and around the JSON object or array of
		//  JSON objects.  This function removes
		//  that unwanted, out-of-band text.
		function removeOutOfBandText(strJsonObj: string): string {
			const braceIndex = strJsonObj.indexOf('{');
			const bracketIndex = strJsonObj.indexOf('[');

			if (braceIndex === -1 && bracketIndex === -1) {
				// Return the original string if no braces or brackets were found
				return strJsonObj;
			}

			// Determine the starting index of the JSON content
			const firstIndex = (braceIndex === -1) ? bracketIndex :
				(bracketIndex === -1) ? braceIndex :
					Math.min(braceIndex, bracketIndex);

			const openChar = strJsonObj[firstIndex];
			const closeChar = openChar === '{' ? '}' : ']';

			let count = 0;
			for (let i = firstIndex; i < strJsonObj.length; i++) {
				if (strJsonObj[i] === openChar) {
					count++;
				} else if (strJsonObj[i] === closeChar) {
					count--;
					if (count === 0) {
						// Found the matching closing brace/bracket
						return strJsonObj.substring(firstIndex, i + 1);
					}
				}
			}

			// If no matching closing brace/bracket is found, return from the first brace/bracket to the end
			return strJsonObj.substring(firstIndex);
		}


		// Step 1: Remove out-of-band text.
		const withoutOutOfBandText =
			removeOutOfBandText(strJsonObj);

		// Step 2: Remove comments (single-line and multi-line)
		const withoutComments = withoutOutOfBandText
			.replace(/\/\/.*(?=\n|\r)/g, '') // Remove single-line comments
			.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

		// Step 3: Ensure all property names are surrounded by double quotes
		const withProperQuotes = withoutComments.replace(
			/([a-zA-Z0-9_]+)\s*:/g, // Matches unquoted keys followed by colon
			'"$1":' // Surround the key with double quotes
		);

		// Step 3: Return the string
		return withProperQuotes;
	}

	// Build the messages for the call.
	const messages = [
		{
			role: "user",
			content: [
				{
					"type": "text",
					// "text": "What'\''s in this image?"
					"text": systemPromptForVisionRecognition
				},
				{
					"type": "image_url",
					"image_url": {
						"url": base64EncodedImageString
					}
				},
				{
					"type": "text",
					"text": "Summarize"
				},
			]
		},
	] as ChatCompletionMessageParam[];

	try {
		// TODO: Currently we do not use SambaNova's custom properties
		//  when making a completion call because those field names
		//  are not found in the OpenAI ChatCompletionCreateParamsNonStreaming
		//  declaration.  Add these later.
		//
		/*
		// Call OpenAI's text completion API endpoint (non-streaming).
		const response = await oai.chat.completions.create({
			model: visionCompletionParams.model_param_val,
			messages,
			// NOTE: Currently this parameter is ignored.  Use the repetition
			//  penalty instead.
			frequency_penalty: visionCompletionParams.frequency_penalty_param_val,
			// NOTE: Currently this parameter is ignored.  Use the repetition
			//  penalty instead.
			presence_penalty: visionCompletionParams.presence_penalty_param_val,
			stream: false, // Set stream to false for immediate response
			temperature: visionCompletionParams.temperature_param_val,
			max_tokens: visionCompletionParams.max_tokens_param_val,
			top_p: visionCompletionParams.top_p_param_val,
			// response_format:  { "type": "json_object" }
		});
		 */

		// Going around OpenAI NPM package because we are having
		//  trouble with it currently.  It gives us errors saying
		//  we have given it an invalid model ID or that we don't
		//  have access to that model I.
		const axiosResponse: AxiosResponse = await axios.post(
			SAMBA_NOVA_TEXT_COMPLETIONS_URL,
			{
				messages: messages,
				// stop: ["<|eot_id|>"],
				model: visionCompletionParams.model_param_val, // "Meta-Llama-3.1-8B-Instruct",
				repetition: visionCompletionParams.repetition_param_val,
				stream: false,
				// Stream options can only be set if stream is TRUE.
				// stream_options: { include_usage: true },
				temperature: visionCompletionParams.temperature_param_val,
				max_tokens: visionCompletionParams.max_tokens_param_val
			} as ChatCompletionCreateParamsNonStreaming,
			{
				headers: {
					"Authorization": `Bearer ${sambaNovaApiKey}`,
					"Content-Type": "application/json"
				}
			}
		);

		if (!axiosResponse.data)
			throw new Error(`The AXIOS response is missing a "data" property.`);

		let response: ChatCompletion = axiosResponse.data as ChatCompletion;

		let textResponse = '';
		let jsonResponse = {};

		// Aggregate text response text elements
		textResponse =
			response.choices?.map(
				(choice) =>
					choice.message?.content).join(' ') || '';

		let conformedTextResponse;

		if (bIsJsonResponseExpected) {
			try {
				const superFixedJsonOutput =
					superFixLlmJsonOutput(textResponse, aryPropertyDetailsOrNull);

				// We should be able to parse the text response into
				//  an object.
				jsonResponse = JSON.parse(superFixedJsonOutput);
			} catch (parseError) {
				return {
					intent_detector_id: intentId,
					// Pass back the URL to the source image.
					url_to_source_image: urlToSourceImage,
					is_error: true,
					error_message: `JSON parse error: ${parseError.message}`,
					text_response: textResponse,
					json_response: {},
					date_time_of_response: getUnixTimestamp(),
				};
			}
		}

		return {
			intent_detector_id: intentId,
			url_to_source_image: urlToSourceImage,
			is_error: false,
			error_message: '',
			text_response: textResponse,
			json_response: jsonResponse,
			date_time_of_response: getUnixTimestamp(),
		};
	} catch (error: any) {
		// Error handling
		const errorMessage = error?.response?.data?.error?.message || error.message || "Unknown error occurred";
		const statusCode = error?.response?.status || 'Unknown status code';

		return {
			intent_detector_id: intentId,
			url_to_source_image: urlToSourceImage,
			is_error: true,
			error_message: `Error ${statusCode}: ${errorMessage}`,
			text_response: '',
			json_response: {},
			date_time_of_response: getUnixTimestamp(),
		};
	}
}

/**
 * Processes multiple SambaNova vision recognition calls in parallel.
 *
 * @param intentId - The ID of the intent making the calls(s).
 * @param systemPrompt - The system prompt to use when processing
 *  the images.
 * @param visionRecognitionParams - The vision recognition parameters
 * 	to used in all calls.
 * @param aryImagePackages - An array of imagePackage objects that will
 *  be processed by a SambaNova vision recognition model.
 * @param aryPropertyDetailsOrNull - If provided, then
 *  we will use our custom JSON parsing function to
 *  parse the LLM text response.  Otherwise, we will
 *  use generic repair methods.
 *
 * @returns - Returns an array of SambaNovaVisionRecognitionResponse
 *  objects, one for each image process.
 */
export async function sambaNovaProcessAllVisionRecognitions(
	intentId: string,
	systemPrompt: string,
	visionRecognitionParams: SambaNovaParams_vision_recognition,
	aryImagePackages: ImagePackage[],
	aryPropertyDetailsOrNull: PropertyDetailsArrayOrNull
): Promise<Array<{ is_error: boolean, intent_id: string, result_or_error: any }>> {

	if (intentId.length < 1) {
		throw new Error("The intentId must not be empty.");
	}

	if (systemPrompt.length < 1) {
		throw new Error("The system prompt must not be empty.");
	}

	// Validate that aryGeneratedImageUrls has at least one non-empty element
	if (!Array.isArray(aryImagePackages) || aryImagePackages.length === 0) {
		throw new Error('aryImagePackages must be a non-empty array of image package objects.');
	}

	// Use Promise.all to execute all vision recognition operations in parallel.
	const promises =
		aryImagePackages.map(async (imagePackage) => {
			try {
				const result =
					await sambaNovaVisionRecognitionImmediate(
						intentId,
						systemPrompt,
						visionRecognitionParams,
						// We pass the URL to our S3 image URL for
						//  use by the vision recognition model.
						imagePackage.urlToOurS3Image,
						// We pass the image data in base 64 encoded string format.
						imagePackage.base64EncodedImageString,
						// The vision recognition model returns just
						//  a text response.
						false,
						aryPropertyDetailsOrNull);
				return { is_error: false, intent_id: intentId, result_or_error: result }; // Successful result
			} catch (error) {
				return { is_error: true, intent_id: intentId, result_or_error: error }; // Capture error in the result object
			}
		});

	// Wait for all promises to resolve
	return Promise.all(promises);
}

// -------------------- END  : VISION MODELS ------------