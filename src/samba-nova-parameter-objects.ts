// This file contains code and objects to help with various
//  SambaNova call parameters.

/*
import {
	DEFAULT_SAMBA_NOVA_TEXT_COMPLETION_MODEL_ID,
	DEFAULT_SAMBA_NOVA_VISION_RECOGNITION_MODEL_ID,
} from "./openai-common"
*/

// -------------------- BEGIN: TEXT COMPLETION CALL PARAMETERS ------------

import {
	DEFAULT_SAMBA_NOVA_TEXT_COMPLETION_MODEL_ID,
	DEFAULT_SAMBA_NOVA_VISION_RECOGNITION_MODEL_ID,
} from "./samba-nova-common"

/**
 * Class representing the parameters for an SambaNova text completion call.
 */
export class SambaNovaParams_text_completion {
	// -------------------- BEGIN: SambaNova custom properties. ------------

	// These parameters are custom to SambaNova's text completion
	//  calls.

	/**
	 * @type {Boolean} This is always bool.
	 *
	 * This parameter controls whether or not to
	 *  use sampling; use greedy decoding otherwise.
	 *  Sampling means randomly picking the next word
	 *  according to its conditional probability
	 *  distribution. And hence, language generation
	 *  using sampling does not remain deterministic
	 *  anymore. If you need to have deterministic
	 *  results, set this as false, as the model is
	 *  less likely to generate unexpected or unusual
	 *  words. Setting it to true allows the model a
	 *  better chance of generating a high quality
	 *  response, even with inherent deficiencies. The
	 *  default value is false.
	 */
	public do_sample: boolean = false;

	/**
	 *
	 * @type {number} This is always float.
	 *
	 * The repetition penalty value can be between 1.0 to
	 *  10.0. A parameter that controls how repetitive text
	 *  can be. A lower value means more repetitive, while
	 *  a higher value means less repetitive. The default
	 *  value is 1.0, which means no penalty.
	 *
	 *  @default 1.0
	 */
	public repetition_penalty_param_val: number = 1.0

	/**
	 *
	 * Used only for Composition of Experts models.
	 *
	 * type: This is always a string.
	 *
	 * This is ID of the expert model to select for
	 *  the request. The default is an empty string
	 *  for those calls that do not use this feature.
	 *
	 * @default ''
	 */
	public select_expert_param_val: string = '';

	/**
	 * @type {number}  The top_k value.  Should be a float
	 *  value between 1 and 100.
	 *
	 * This value allows  the model to choose randomly
	 *  among the top k tokens by their respective
	 *  probabilities. For example, choosing the top 3
	 *  tokens means setting the top k parameter to 3.
	 *  Changing the top k parameter sets the size of
	 *  the shortlist the model samples from as it
	 *  outputs each token. Setting top k to 1 gives
	 *  us greedy decoding. The default is set as 50.
	 *
	 * @default 0.5
	 */
	public top_k_param_val: number = 0.5;


	// -------------------- END  : SambaNova custom properties. ------------

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
	 */
	public temperature_param_val: number = 0.1; //  0.5;

	/**
	 * NOTE: SambaNova does not support this parameter so it
	 *  is ignored.
	 *
	 * @type {number} Presence penalty parameter value.
	 * Controls how much to penalize new tokens based on whether they appear in the text so far.
	 * @default 0.5
	 */
	public presence_penalty_param_val: number = 0.5;

	/**
	 * NOTE: SambaNova does not support this parameter, so it
	 *  is ignored.
	 *
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
	public model_param_val: string = DEFAULT_SAMBA_NOVA_TEXT_COMPLETION_MODEL_ID;

	/**
	 * Creates a new instance of SambaNovaParams with default or custom values.
	 * @param {Partial<SambaNovaParams_text_completion>} [params] Optional parameters to initialize the object.
	 */
	constructor(params?: Partial<SambaNovaParams_text_completion>) {
		if (params) {
			Object.assign(this, params);
		}
	}
}

// -------------------- END  : TEXT COMPLETION CALL PARAMETERS ------------

// -------------------- BEGIN: VISION RECOGNITION CALL PARAMETERS ------------

/**
 * Class representing the parameters for an SambaNova vision recognition completion call.
 */
export class SambaNovaParams_vision_recognition {
	// -------------------- BEGIN: SambaNova custom properties. ------------

	// These parameters are custom to SambaNova's vision recognition
	//  calls.

	/**
	 * @type {Boolean} This is always bool.
	 *
	 * This parameter controls whether or not to
	 *  use sampling; use greedy decoding otherwise.
	 *  Sampling means randomly picking the next word
	 *  according to its conditional probability
	 *  distribution. And hence, language generation
	 *  using sampling does not remain deterministic
	 *  anymore. If you need to have deterministic
	 *  results, set this as false, as the model is
	 *  less likely to generate unexpected or unusual
	 *  words. Setting it to true allows the model a
	 *  better chance of generating a high quality
	 *  response, even with inherent deficiencies. The
	 *  default value is false.
	 */
	public do_sample: boolean = false;

	/**
	 *
	 * @type {number} This is always float.
	 *
	 * The repetition penalty value can be between 1.0 to
	 *  10.0. A parameter that controls how repetitive text
	 *  can be. A lower value means more repetitive, while
	 *  a higher value means less repetitive. The default
	 *  value is 1.0, which means no penalty.
	 *
	 *  @default 1.0
	 */
	public repetition_penalty_param_val: number = 1.0

	/**
	 *
	 * Used only for Composition of Experts models.
	 *
	 * type: This is always a string.
	 *
	 * This is ID of the expert model to select for
	 *  the request. The default is an empty string
	 *  for those calls that do not use this feature.
	 *
	 * @default ''
	 */
	public select_expert_param_val: string = '';

	/**
	 * @type {number}  The top_k value.  Should be a float
	 *  value between 1 and 100.
	 *
	 * This value allows  the model to choose randomly
	 *  among the top k tokens by their respective
	 *  probabilities. For example, choosing the top 3
	 *  tokens means setting the top k parameter to 3.
	 *  Changing the top k parameter sets the size of
	 *  the shortlist the model samples from as it
	 *  outputs each token. Setting top k to 1 gives
	 *  us greedy decoding. The default is set as 50.
	 *
	 * @default 0.5
	 */
	public top_k_param_val: number = 0.5;


	// -------------------- END  : SambaNova custom properties. ------------

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
	 *
	 * @default 0.5
	 */
	public temperature_param_val: number = 0.1; // 0.5;

	/**
	 * NOTE: SambaNova does not support this parameter so it
	 *  is ignored.
	 *
	 * @type {number} Presence penalty parameter value.
	 * Controls how much to penalize new tokens based on whether they appear in the text so far.
	 */
	public presence_penalty_param_val: number = 0; // 0.5;

	/**
	 * NOTE: SambaNova does not support this parameter, so it
	 *  is ignored.
	 *
	 * @type {number} Frequency penalty parameter value.
	 * Controls how much to penalize new tokens based on their existing frequency in the text.
	 */
	public frequency_penalty_param_val: number = 0; // 0.5;


	/**
	 * THIS is SambaNova's penalty for repeating text in the answer.
	 *
	 * @type {number} Repetition penalty parameter value.
	 *
	 * Controls how much to penalize new tokens based on their existence in the text.
	 */
	public repetition_param_val: number = 0;

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
	public model_param_val: string = DEFAULT_SAMBA_NOVA_VISION_RECOGNITION_MODEL_ID;

	/**
	 * Creates a new instance of SambaNovaParams with default or custom values.
	 * @param {Partial<SambaNovaParams_text_completion>} [params] Optional parameters to initialize the object.
	 */
	constructor(params?: Partial<SambaNovaParams_vision_recognition>) {
		if (params) {
			Object.assign(this, params);
		}
	}
}


// -------------------- END  : VISION RECOGNITION CALL PARAMETERS ------------

// -------------------- BEGIN: TEXT COMPLETION RESPONSE INTERFACE ------------

// This interface describes the object we build from the SambaNova
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

// -------------------- BEGIN: EXPECTED JSON RESPONSE FOR OBJECT SHAPE ASSUMPTIONS TEXT COMPLETIONS ------------

/*
[
     { object_name: <the name of the object>,
       assumptions: [
          <assumption 1>,
          <assumption 2>,
         <<assumption 3> }
]
 */

// Object {object_name: "A beagle", assumptions: Array(3)}

/**
 * The JSON object output by the output shape assumptions
 *  LLM.
 *
export interface ObjectShapeAssumptions {
	object_name: string;
	assumptions: string[];
}
*/

/**
 * The top level object returned by the output shape assumptions
 *  LLM.
 */
export interface ObjectShapeToplevel {
	object_name: string;
	assumptions: string[];
}

// -------------------- END  : EXPECTED JSON RESPONSE FOR OBJECT SHAPE ASSUMPTIONS LLM ------------