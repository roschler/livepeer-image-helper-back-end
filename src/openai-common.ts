// This module contains code shared by the different apps this
//  back-end server supports.

import OpenAI from "openai"
import { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { OpenAIParams_text_completion, TextCompletionResponse } from "./openai-parameter-objects"
import { getUnixTimestamp } from "./common-routines"

export const oai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
})

/**
 * This call makes the actual text completion call to the LLM
 *  and returns a streaming text completion.
 *
 * @param {String} systemPrompt - The prompt to use in the
 *  system role.
 * @param {String} userPrompt - The prompt entered by the user
 *  to be included with the system prompt.
 * @param {OpenAIParams_text_completion} textCompletionParams - A
 *  valid OpenAI text completion call parameters object.
 */
export async function chatCompletionStream(
		systemPrompt: string,
		userPrompt: string,
		textCompletionParams: OpenAIParams_text_completion) {
	console.log(
		`Creating chat completion stream with system prompt: ${systemPrompt}`,
	)
	console.log(`User prompt: ${userPrompt}`)
	const messages = [
		{
			role: "system",
			content: systemPrompt,
		},
		{
			role: "user",
			content: userPrompt,
		},
	] as ChatCompletionMessageParam[]

	// Call OpenAI's text completion API endpoint.
	return oai.chat.completions.create({
		model: textCompletionParams.model_param_val,
		messages,
		frequency_penalty: textCompletionParams.frequency_penalty_param_val,
		presence_penalty: textCompletionParams.presence_penalty_param_val,
		// stream: textCompletionParams.stream_param_val,
		// Currently we always want text completions streamed to us.
		stream: true,
		temperature: textCompletionParams.temperature_param_val,
		max_tokens: textCompletionParams.max_tokens_param_val,
		top_p: textCompletionParams.top_p_param_val,
	})
}

/**
 * This call makes the actual text completion call to the LLM
 *  and returns a non-streamed completion.
 *
 * @param {String} systemPrompt - The prompt to use in the
 *  system role.
 * @param {String} userPrompt - The prompt entered by the user
 *  to be included with the system prompt.
 * @param {OpenAIParams_text_completion} textCompletionParams - A
 *  valid OpenAI text completion call parameters object.
 */
export async function chatCompletionStatic(
	systemPrompt: string,
	userPrompt: string,
	textCompletionParams: OpenAIParams_text_completion)
{
	console.log(
		`Creating chat completion stream with system prompt: ${systemPrompt}`,
	)
	console.log(`User prompt: ${userPrompt}`)
	const messages = [
		{
			role: "system",
			content: systemPrompt,
		},
		{
			role: "user",
			content: userPrompt,
		},
	] as ChatCompletionMessageParam[]

	// Call OpenAI's text completion API endpoint.
	return oai.chat.completions.create({
		model: textCompletionParams.model_param_val,
		messages,
		frequency_penalty: textCompletionParams.frequency_penalty_param_val,
		presence_penalty: textCompletionParams.presence_penalty_param_val,
		stream: false,
		temperature: textCompletionParams.temperature_param_val,
		max_tokens: textCompletionParams.max_tokens_param_val,
		top_p: textCompletionParams.top_p_param_val,
	})
}
/**
 * This call makes a non-streaming text completion call to the LLM.
 *
 * @param {string} intentDetectorId - The ID of the intent detector making the call.
 *  This must not be empty.
 * @param {string} systemPrompt - The prompt to use in the system role.
 * @param {string} userInput - The latest input from the user, to be included with the system prompt.
 * @param {OpenAIParams_text_completion} textCompletionParams - A valid OpenAI text completion call parameters object.
 * @param {boolean} bIsJsonResponseExpected - Set this to TRUE if
 *  the LLM is supposed to return a JSON object as its response,
 *  FALSE if you expect a pure text response.
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
export async function chatCompletionImmediate(
	intentDetectorId: string,
	systemPrompt: string,
	userInput: string,
	textCompletionParams: OpenAIParams_text_completion,
	bIsJsonResponseExpected: boolean
): Promise<TextCompletionResponse> {
	if (!intentDetectorId) {
		throw new Error("The intentDetectorId must not be empty.");
	}

	// This function will make sure that string that is
	//  supposed to be a JSON object is properly formed.
	//  Sometimes the LLM throws in comments into a JSON
	//  object which are not allowed, or forgets to double-quote
	//  all property names.
	function conformJsonObjectString(strJsonObj: string): string {
		// Every now and then the engine throws in some text
		//  outside and around the JSON object or array of
		//  JSON objects.  This function removes
		//  that unwanted, out-of-band text.
		function removeOutOfBandText(strJsonObj: string): string {
			const topLevelBracesOrBracketsRegex = /({[\s\S]*}|[[\s\S]*])/;
			const match = strJsonObj.match(topLevelBracesOrBracketsRegex);

			if (match) {
				return match[0];
			}

			// Return the original string if no braces or brackets were found
			return strJsonObj;
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
		// Call OpenAI's text completion API endpoint (non-streaming).
		const response = await oai.chat.completions.create({
			model: textCompletionParams.model_param_val,
			messages,
			frequency_penalty: textCompletionParams.frequency_penalty_param_val,
			presence_penalty: textCompletionParams.presence_penalty_param_val,
			stream: false, // Set stream to false for immediate response
			temperature: textCompletionParams.temperature_param_val,
			max_tokens: textCompletionParams.max_tokens_param_val,
			top_p: textCompletionParams.top_p_param_val,
			// response_format:  { "type": "json_object" }
		});

		let textResponse = ''
		let jsonResponse = {}

		// Aggregate text response
		textResponse =
			response.choices?.map((choice) => choice.message?.content).join(' ') || '';

		let conformedTextResponse;

		if (bIsJsonResponseExpected) {
			try {

				conformedTextResponse =
					conformJsonObjectString(textResponse)

				// We should be able to parse the text response into
				//  an object.

				jsonResponse = JSON.parse(conformedTextResponse);
			} catch (parseError) {
				return {
					intent_detector_id: intentDetectorId,
					is_error: true,
					error_message: `JSON parse error: ${parseError.message}`,
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
 * This function checks to see if the prompt
 *  is flagged as harmful before passing the
 *  request to OpenAI.
 *
 * @param {String} input - The user input to
 *  inspect.
 */
export async function isFlagged(input: string) {
	const response =
		await oai.moderations.create({ input })
	const [results] =
		response.results // we only need the first result

	if (results?.flagged === true)
		return true;
	else
		return false;
}