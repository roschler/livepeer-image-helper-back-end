// This file contains code and objects to help with various
//  OpenAI call parameters.

/**
 * Class representing the parameters for an OpenAI text completion call.
 */
export class OpenAIParams_text_completion {
	/**
	 * @type {number} Top-p sampling parameter value.
	 * @default 0.5
	 */
	public top_p_param_val: number = 0.5;

	/**
	 * @type {number} Maximum tokens parameter value.
	 * @default 150
	 */
	public max_tokens_param_val: number = 2000;

	/**
	 * @type {number} Temperature parameter value.
	 * Controls the randomness of the model's output.
	 * @default 0.5
	 */
	public temperature_param_val: number = 0.5;

	/**
	 * @type {number} Presence penalty parameter value.
	 * Controls how much to penalize new tokens based on whether they appear in the text so far.
	 * @default 0.5
	 */
	public presence_penalty_param_val: number = 0.5;

	/**
	 * @type {number} Frequency penalty parameter value.
	 * Controls how much to penalize new tokens based on their existing frequency in the text.
	 * @default 0.5
	 */
	public frequency_penalty_param_val: number = 0.5;

	/**
	 * @type {boolean} Stream parameter value.
	 * Determines whether the API response should be streamed or not.
	 * @default false
	 */
	// For now, we always want text completions streamed, otherwise
	//  it complicates the rest of the call flow unnecessarily.
	// public stream_param_val: boolean = false;

	/**
	 * @type {string} Model parameter value.
	 * Specifies the model to use for the API call.
	 * @default "gpt-3.5-turbo"
	 */
	public model_param_val: string = "gpt-3.5-turbo";

	/**
	 * Creates a new instance of OpenAIParams with default or custom values.
	 * @param {Partial<OpenAIParams_text_completion>} [params] Optional parameters to initialize the object.
	 */
	constructor(params?: Partial<OpenAIParams_text_completion>) {
		if (params) {
			Object.assign(this, params);
		}
	}
}

// -------------------- BEGIN: TEXT COMPLETION RESPONSE INTERFACE ------------

// This interface describes the object we build from the OpenAI
//  text completion response and pass around the application.
export interface TextCompletionResponse {
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

// -------------------- BEGIN: EXPECTED JSON RESPONSE OBJECT FORMAT FOR IMAGE ASSISTANT TEXT COMPLETIONS ------------

// This interface describes the JSON object we tell the image generator
//  prompt LLM to produce.
//
// NOTE: Remember to update this object if we change the image generator
//  LLM system prompt!
export interface ImageGeneratorLlmJsonResponse
{
	"prompt": string,
	"negative_prompt": string,
	"user_input_has_complaints": boolean
}

// -------------------- END  : EXPECTED JSON RESPONSE OBJECT FORMAT FOR IMAGE ASSISTANT TEXT COMPLETIONS ------------

// -------------------- BEGIN: EXPECTED JSON RESPONSE OBJECT FORMAT FOR LICENSE ASSISTANT TEXT COMPLETIONS ------------

// This interface describes the JSON object we tell the license assistant
//  LLM to produce.
//
// NOTE: Remember to update this object if we change the license assistant
//  LLM system prompt and to update it on the client front-end as well!
export interface LicenseTermsLlmJsonResponse
{
	system_prompt: string; // <This is the answer you have crafted for the user>,
	pil_terms: unknown; // <This is the PilTerms JSON object.  Any values you were able to determine during the chat volley should be assigned to the related field or fields.>
	isUserSatisfiedWithLicense: boolean; // <This should be TRUE if the user indicated they are satisfied with the current terms of the license, FALSE if not.>
	license_terms_explained: string; // The current friendly explanation of the license terms the user has specified so far.
}

// This is the new interface the LLM returns.  We are using a more
//  powerful LLM model than before.
//
// NOTE: Remember to update this object if we change the license assistant
//  LLM system prompt and to update it on the client front-end as well!
export interface LicenseAssistantNuevoResponse
{
	// This is the license type the LLM has determined
	//  is the best match for the user.
	best_license_guess: string,
	// This is the LLM's confidence in it's license guess.
	confidence: string,
	// This is the next question to ask the user.
	next_question: string
	// The current friendly explanation of the license terms the user has specified so far.
	license_terms_explained: string;
	// TRUE if the LLM has received an answer at least one
	//  YES/TRUE answer to a license choice confirmation
	//  question, FALSE if not.
	is_license_choice_confirmed: boolean;
	// For commercial licenses, the minting fee for the license.
	defaultMintingFee: number;
	// TRUE if commercial use is allowed, FALSE if not.
	commercialUse: boolean;
	// TRUE if derivative works are allowed, FALSE if not.
	derivativesAllowed: boolean;
	// The percentage or revenue required from a derivative works
	//  earnings, or 0 if none.
	commercialRevShare: number;
}

// -------------------- END  : EXPECTED JSON RESPONSE OBJECT FORMAT FOR LICENSE ASSISTANT TEXT COMPLETIONS ------------

// -------------------- BEGIN: EXPECTED JSON RESPONSE FOR IMAGE GEN PROMPT TO TWEET TEXT COMPLETIONS ------------

// NOTE: Remember to update this object if we change the prompt!
export interface ImageGenPromptToTweetLlmJsonResponse
{
	// The text for the tweet
	"tweet_text": string,
	// The title for the Twitter card that shows the image preview
	"twitter_card_title": string
	// The description for the Twitter card that shows the image preview
	"twitter_card_description": string
}

// -------------------- END  : EXPECTED JSON RESPONSE FOR IMAGE GEN PROMPT TO TWEET TEXT COMPLETIONS ------------