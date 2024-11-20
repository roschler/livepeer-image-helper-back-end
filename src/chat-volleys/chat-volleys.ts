// This module contains the code and classes for maintaining
//  a chat history for a particular user.

// -------------------- BEGIN: DEFAULT IMAGE GENERATION VALUES ------------

// These are the default choices we make for various image
//  generation parameters.
import { appendEosCharIfNotPresent, getCurrentOrAncestorPathForSubDirOrDie, getUnixTimestamp } from "../common-routines"

import fs from "fs"
import path from "node:path"
import { readJsonFile, writeJsonFile } from "../json/json-file-substitute"
import { TextCompletionResponse } from "../openai-parameter-objects"
import {
	DEFAULT_GUIDANCE_SCALE,
	DEFAULT_IMAGE_GENERATION_MODEL_ID, DEFAULT_NUMBER_OF_IMAGE_GENERATION_STEPS,
	IntentJsonResponseObject,
} from "../enum-image-generation-models"
import { BooleanOrNull, NumberOrNull, StateType, StringOrNull } from "../system/types"
import { TEMPERATURE_ACCURACY_FIRST } from "../openai-chat-bot"

/**
 * This class has the same fields as the PilTerms struct
 *  but as a JavaScript object with JavaScript types that
 *  can optionally be NULL.
 */
export class PilTermsExtended {
	public transferable: BooleanOrNull = null;
	public royaltyPolicy: StringOrNull = null;
	public mintingFee: NumberOrNull = null;
	public expiration: NumberOrNull = null;
	public commercialUse: BooleanOrNull = null;
	public commercialAttribution: BooleanOrNull = null;
	public commercializerChecker: StringOrNull = null;
	public commercializerCheckerData: StringOrNull = null;
	public commercialRevShare: NumberOrNull = null;
	public commercialRevCelling: NumberOrNull = null;
	public derivativesAllowed: BooleanOrNull = null;
	public derivativesAttribution: BooleanOrNull = null;
	public derivativesApproval: BooleanOrNull = null;
	public derivativesReciprocal: BooleanOrNull = null;
	public derivativeRevCelling: NumberOrNull = null;
	public currency: StringOrNull = null;
	public url: StringOrNull = null;

	/**
	 * @constructor
	 */
	constructor() {
	}
}

/**
 * Simple interface to return the last base leve
 *  image description prompt and its matching
 *  negative prompt.
 */
export interface BaseLevelImageDescriptionPromptPair {
	prompt: string;
	negative_prompt: string;
}

/*
The parentheses in the recommended negative prompt are part of the syntax used to influence how strongly the model weighs certain words or phrases. Here's a breakdown:

Parentheses () are used to group terms or phrases and apply emphasis.
The numbers like :1.3 or :1.2 after the colon indicate the strength or weight of the negative prompt. A number greater than 1.0 increases the strength, and a number less than 1.0 would decrease it.

So, when including the negative prompt in your request to the model, you should include the parentheses and weights exactly as shown, as they help guide the model on which attributes to minimize more aggressively.
 */
const DEFAULT_NEGATIVE_PROMPT = '(octane render, render, drawing, anime, bad photo, bad photography:1.3), (worst quality, low quality, blurry:1.2), (bad teeth, deformed teeth, deformed lips), (bad anatomy, bad proportions:1.1), (deformed iris, deformed pupils), (deformed eyes, bad eyes), (deformed face, ugly face, bad face), (deformed hands, bad hands, fused fingers), morbid, mutilated, mutation, disfigured';

const CONSOLE_CATEGORY = 'chat-volley'

// -------------------- END  : DEFAULT IMAGE GENERATION VALUES ------------

// -------------------- BEGIN: class, CurrentChatState_image_assistant ------------

/**
 * Represents the current state of an image assistant chat.
 */
export class CurrentChatState_image_assistant {
	/**
	 * The model currently selected for image generation.
	 */
	public model_id: string;

	/**
	 * The LoRA models object.  If any LoRA objects have
	 *  been selected, there will be a property for each
	 *  one where the property name is the LoRA model ID
	 *  and property value is the version number.
	 */
	public loras: {};

	/**
	 * The current value set for the context free guidance parameter.
	 */
	public guidance_scale: number;

	/**
	 * The current value set for the number of steps to use when generating an image.
	 */
	public steps: number;

	/**
	 * The timestamp for the date/time this object was created.
 	 */
	public timestamp: number = getUnixTimestamp() ;

	/**
	 * The temperature to use with the main image generation
	 *  text completion call.  We start with a value that
	 *  maximizes accuracy over embellishments.
	 */
	public temperature: number = TEMPERATURE_ACCURACY_FIRST;

	// -------------------- BEGIN: AUTO IMAGE REFINEMENT FIELDS ------------

	// These are the fields used in an auto image refinement session.

	/**
	 * This is the CONTIGUOUS refinement iteration count
	 *  during an auto image refinement session.  If the
	 *  user does a manual prompt, this count is reset
	 *  to 0.
	 */
	public refinement_iteration_count: number = 0;

	/**
	 * This is the number of errors detected this refinement
	 *  iteration.  An error is a missing or incorrect
	 *  image element when comparing the prompt that
	 *  generated an image to the description given
	 *  to us by vision recognition model.
	 */
	public num_image_prompt_errors: number = 0;

	/**
	 * This is the suggested feedback that the client can
	 *  use as the user input in the next chat volley,
	 *  should the client choose to continue the
	 *  auto image refinement session.
	 */
	public suggested_feedback: string = '';

	// -------------------- END  : AUTO IMAGE REFINEMENT FIELDS ------------

	/**
	 * Constructs an instance of CurrentChatState_image_assistant.
	 *
	 * @param model_id - The model currently selected for image
	 *  generation.
	 * @param loras - The LoRA object that has the currently
	 *  selected, if any, LoRA models.
	 * @param guidance_scale - The current value set for the
	 *  context free guidance parameter.
	 * @param steps - The current value set for the number of
	 *  steps to use when generating an image.
	 * @param refinement_iteration_count - If we are in a auto
	 *  image refinement session then this is the number
	 *  of automatic refinements that have been done so
	 *  far for the last generated image.
	 * @param num_image_prompt_errors - This is the number of
	 *  errors detected between what was described with the
	 *  current image generation prompt and the description
	 *  returned by the vision recognition model.
	 * @param suggested_feedback - This is the suggested
	 *  feedback we created based on the variance between
	 *  what was described with the current image generation
	 *  prompt and the description returned by the vision
	 *  recognition model.
	 */
	constructor(
			model_id: string,
			loras: object,
			guidance_scale: number,
			steps: number,
			refinement_iteration_count: number,
			num_image_prompt_errors: number,
			suggested_feedback: string) {
		this.model_id = model_id;
		this.loras = loras;
		this.guidance_scale = guidance_scale;
		this.steps = steps;
		this.refinement_iteration_count = refinement_iteration_count;
		this.num_image_prompt_errors = num_image_prompt_errors;
		this.suggested_feedback = suggested_feedback;
	}

	/**
	 * This function outputs a friendly string containing
	 *  the current stable diffusion parameters.
	 */
	public toStringStableDiffusionParameters() {
		return `    MODEL ID: ${this.model_id}\n    STEPS: ${this.steps}\n    GUIDANCE SCALE: ${this.guidance_scale}`;
	}

	/**
	 * Create an object of this type, initialized with
	 *  our default values.
	 */
	public static createDefaultObject(): CurrentChatState_image_assistant {
		const newObj =
			new CurrentChatState_image_assistant(
				DEFAULT_IMAGE_GENERATION_MODEL_ID,
				{},
				DEFAULT_GUIDANCE_SCALE,
				DEFAULT_NUMBER_OF_IMAGE_GENERATION_STEPS,
				0,
				0,
				''
			);

		return newObj
	}

	// -------------------- BEGIN: SERIALIZATION METHODS ------------

	// Serialization method
	public toJSON() {
		return {
			__type: 'CurrentChatState_image_assistant',
			model_id: this.model_id,
			loras: this.loras,
			guidance_scale: this.guidance_scale,
			steps: this.steps,
			timestamp: this.timestamp,
			refinement_iteration_count: this.refinement_iteration_count,
			num_image_prompt_errors: this.num_image_prompt_errors,
			suggested_feedback: this.suggested_feedback
		};
	}

	// Deserialization method
	static fromJSON(json: any): CurrentChatState_image_assistant {
		return new CurrentChatState_image_assistant(
			json.model_id,
			json.loras,
			json.guidance_scale,
			json.steps,
			json.refinement_iteration_count,
			json.num_image_prompt_errors,
			json.suggested_feedback
		);
	}

	// Use the serialization methods to clone a current chat state
	//  object, to avoid unwanted couplings between objects.
	public clone() {
		return CurrentChatState_image_assistant.fromJSON(this.toJSON())
	}

	// -------------------- END  : SERIALIZATION METHODS ------------
}


// -------------------- END  : class, CurrentChatState_image_assistant ------------

// -------------------- BEGIN: class, CurrentChatState_image_assistant ------------

/**
 * Represents the current state of a license assistant chat.
 */
export class CurrentChatState_license_assistant {
	/**
	 * The PilTerms object for license terms.
	 */
	public pilTerms: PilTermsExtended;

	/**
	 * The timestamp for the date/time this object was created.
	 */
	public timestamp: number = getUnixTimestamp() ;

	/**
	 * Constructs an instance of CurrentChatState_license_assistant.
	 *
	 */
	constructor(
		pilTerms: PilTermsExtended | null) {

		// If the given pil_terms input parameter is null, then create
		//  a default one.
		this.pilTerms =
			pilTerms === null
				? new PilTermsExtended()
				: pilTerms
	}

	/**
	 * Create an object of this type, initialized with
	 *  our default values.
	 */
	public static createDefaultObject(): CurrentChatState_license_assistant {
		const newObj =
			new CurrentChatState_license_assistant(null);

		return newObj
	}


	// -------------------- BEGIN: SERIALIZATION METHODS ------------

	// Serialization method
	public toJSON() {
		return {
			__type: 'CurrentChatState_license_assistant',
			pilTerms: this.pilTerms,
			timestamp: this.timestamp,
		};
	}

	// Deserialization method
	static fromJSON(json: any): CurrentChatState_license_assistant {
		return new CurrentChatState_license_assistant(
			json.pilTerms
		);
	}

	// Use the serialization methods to clone a current chat state
	//  object, to avoid unwanted couplings between objects.
	public clone() {
		return CurrentChatState_license_assistant.fromJSON(this.toJSON())
	}

	// -------------------- END  : SERIALIZATION METHODS ------------
}


// -------------------- END  : class, CurrentChatState_license_assistant ------------

// -------------------- BEGIN: ChatVolley ------------

/**
 * NOTE: To avoid a major refactoring, for now, we are
 *  keeping the image generation and license terms
 *  fields in the same object (although we do create
 *  separate ChatHistory files for the image assistant
 *  and license assistant chat sessions).
 *
 * TODO: Later, create separate object trees for the
 *  image and license assistants.
 */


/**
 * Represents a volley of communication between the user and the system, tracking various states.
 */
export class ChatVolley {

	// -------------------- BEGIN: COMMON ASSISTANT FIELDS ------------

	/**
	 * The current date/time in Unix timestamp format.
	 */
	public timestamp: number;

	/**
	 * The user input received that began the volley.
	 */
	public user_input: string;

	/**
	 * The response from our system.
	 */
	public text_completion_response: TextCompletionResponse;

	/**
	 * The full prompt that was passed to the
	 *  image generator model.
	 */
	public prompt: string;

	/**
	 * The full negative prompt that was passed to the
	 *  image generator model.
	 */
	public negative_prompt: string;

	/**
	 * The response that was shown to the user in the
	 *  client.
	 */
	public response_to_user: string;

	/**
	 * Array of intent detection JSON response objects that
	 *  were provided by the LLM response.
	 */
	public array_of_intent_detections: IntentJsonResponseObject[];

	/**
	 * The full system prompt we sent to the LLM for consideration.
	 */
	public full_system_prompt: string;

	/**
	 * The full user prompt we sent to the LLM for consideration.
	 */
	public full_user_prompt: string;

	// -------------------- END  : COMMON ASSISTANT FIELDS ------------

	// -------------------- BEGIN: IMAGE ASSISTANT FIELDS ------------

	/**
	 * If TRUE, then this chat volley is considered to
	 *  be the start of a new image generation or license
	 *  terms session.
	 *
	 *  If FALSE, then it is considered to be a
	 *  continuation of an existing session.
	 */
	public is_new_session: boolean;

	/**
	 * If TRUE, then this chat volley is considered is
	 *  part of an auto image refinement session with
	 *  the server as the "user" input source.
	 *
	 *  If FALSE, then it is considered to be a
	 *   normal chat volley with the user.
	 */
	// public is_auto_refinement_session: boolean;

	/**
	 * The image processing mode that was used
	 *  during the chat volley.  (See
	 *  EnumImageProcessingModes.)
 	 */
	public image_processing_mode: string;

	/**
	 * The state of the chat at the start of the volley.
	 */
	public chat_state_at_start_image_assistant: CurrentChatState_image_assistant | null;

	/**
	 * The state of the chat at the end of the volley.
	 */
	public chat_state_at_end_image_assistant: CurrentChatState_image_assistant | null;

	/**
	 * These are the image URLs for the images that were generated
	 *  during this chat volley.  These are the S3 URLs for the
	 *  JPEG files we stored in the S3 bucket.
	 */
	public array_of_image_urls: string[] = [];

	// -------------------- END  : IMAGE ASSISTANT FIELDS ------------

	// -------------------- BEGIN: LICENSE ASSISTANT FIELDS ------------

	/**
	 * The state of the chat at the start of the volley.
	 */
	public chat_state_at_start_license_assistant: CurrentChatState_license_assistant | null;

	/**
	 * The state of the chat at the end of the volley.
	 */
	public chat_state_at_end_license_assistant: CurrentChatState_license_assistant | null;


	// -------------------- END  : LICENSE ASSISTANT FIELDS ------------


	/**
	 * Constructs an instance of a ChatVolley object.
	 *
	 * @param is_new_session - If TRUE, then this volley is considered
	 *  the start of a new image generation or license terms session.
	 *
	 *  If FALSE, then it is considered the continuation of an existing
	 *   session.
	 * @param override_timestamp - If you want to assign a specific
	 *  timestamp value, use this parameter to do that.  Otherwise,
	 *  pass NULL and the current date/time will be used.
	 * @param user_input - The user input received that began the volley.
	 * @param prompt - The prompt that was passed to the image generator
	 * 	model.
	 * @param negative_prompt - The negative prompt that was passed to the
	 * 	image generator model.
	 * @param text_completion_response - The whole response from the image
	 * 	generator prompt maker LLM.
	 * @param response_sent_to_client - The response we sent to the user
	 * 	via the client websocket connection.
	 * @param chat_state_at_start_image_assistant -  For image assistant
	 * 	chats, the state of the chat at the start of the volley.
	 * @param chat_state_at_end_image_assistant - For image assistant
	 * 	chats, the state of the chat at the end of the volley.
	 * @param chat_state_at_start_license_assistant - For license assistant
	 * 	chats, the state of the chat at the start of the volley.
	 * @param chat_state_at_end_license_assistant - For license assistant
	 * 	chats, the state of the chat at the end of the volley.
	 * @param array_of_intent_detections - Array of intent detections
	 *  including complaint type and complaint text.
	 * @param full_system_prompt - The full prompt we sent to the LLM
	 *  for consideration.
	 * @param full_user_input - The full user prompt we sent to the LLM
	 *  for consideration with our adornments made (e.g. - chat history,
	 *  wrong content instructions, etc.)
	 * @param image_processing_mode - The image processing mode that
	 *  was used this volley.
	 * @param array_of_image_urls - The image URLs for the images that
	 *  were generated  during the chat volley.
	 */
	constructor(
		is_new_session: boolean,
		override_timestamp: number | null,
		user_input: string,
		prompt: string,
		negative_prompt: string,
		text_completion_response: TextCompletionResponse,
		response_sent_to_client: string,
		chat_state_at_start_image_assistant: CurrentChatState_image_assistant | null,
		chat_state_at_end_image_assistant: CurrentChatState_image_assistant | null,
		chat_state_at_start_license_assistant: CurrentChatState_license_assistant | null,
		chat_state_at_end_license_assistant: CurrentChatState_license_assistant | null,
		array_of_intent_detections: IntentJsonResponseObject[],
		full_system_prompt: string,
		full_user_input: string,
		image_processing_mode: string,
		array_of_image_urls: string[]
	) {
		this.is_new_session = is_new_session;

		// If an override timestamp was provided, use it.
		//  Otherwise, default to the current date/time.
		this.timestamp =
			override_timestamp
				? override_timestamp
				: getUnixTimestamp();

		this.user_input = user_input;
		this.text_completion_response = text_completion_response;
		this.chat_state_at_start_image_assistant = chat_state_at_start_image_assistant;
		this.chat_state_at_end_image_assistant = chat_state_at_end_image_assistant;
		this.chat_state_at_start_license_assistant = chat_state_at_start_license_assistant;
		this.chat_state_at_end_license_assistant = chat_state_at_end_license_assistant;
		this.array_of_intent_detections = array_of_intent_detections;
		this.prompt = prompt;
		this.negative_prompt = negative_prompt;
		this.response_to_user = response_sent_to_client;
		this.full_system_prompt = full_system_prompt;
		this.full_user_prompt = full_user_input;
		this.image_processing_mode = image_processing_mode;
		this.array_of_image_urls = array_of_image_urls;
	}

	/**
	 * This function returns the total time it took to
	 *  process this chat volley.
	 *
	public getVolleyRoundTripTime_milliseconds(): number {
		const deltaChatStates =
			this.chat_state_at_end_image_assistant.timestamp -
				this.chat_state_at_start_image_assistant.timestamp;

		return deltaChatStates;
	}
		*/

	/**
	 * This function creates a JSON object but as a
	 *  plain string that will be passed to the LLM
	 *  as part of the recent chat history.
	 *
	 * NOTE!:  Make sure the format matches that we
	 *  illustrated in the main system prompt!
	 */
	public buildChatVolleySummary_json() {
		return `
		    {\n
		    	"    user_input": ${this.user_input},\n
		    	"    prompt": ${this.prompt},\n
		    	"    negative_prompt": ${this.negative_prompt}\n
		    }\n
		`
	}

	/**
	 * This function creates a text block that
	 *   will be passed to the LLM as part of
	 *   the recent chat history.
	 *
	 * NOTE!: Make sure the format matches that we
	 *  illustrated in the main system prompt for
	 *  each chatbot assistant type!
	 */
	public buildChatVolleySummary_text() {
		const strSummary =
		    `USER INPUT: ${this.user_input},\n
		     SYSTEM RESPONSE: ${this.response_to_user},\n\n`

		     // TODO: Re-enable this once we solve the vanishing
			 //  previous image content issue.  Needs to be
			 //  different for the different chatbot types, possibly.
		     // NEGATIVE PROMPT: ${this.negative_prompt}\n`
		return strSummary
	}

	// -------------------- BEGIN: SERIALIZATION METHODS ------------

	// Serialization method
	public toJSON() {
		return {
			__type: 'ChatVolley',
			is_new_image: this.is_new_session,
			timestamp: this.timestamp,
			user_input: this.user_input,
			text_completion_response: this.text_completion_response,
			chat_state_at_start_image_assistant:
				this.chat_state_at_start_image_assistant === null
					? null
					: this.chat_state_at_start_image_assistant.toJSON(),
			chat_state_at_end_image_assistant:
				this.chat_state_at_end_image_assistant === null
					? null
					: this.chat_state_at_end_image_assistant.toJSON(),
			chat_state_at_start_license_assistant:
				this.chat_state_at_start_license_assistant === null
					? null
					: this.chat_state_at_start_license_assistant.toJSON(),
			chat_state_at_end_license_assistant:
				this.chat_state_at_end_license_assistant === null
					? null
					: this.chat_state_at_end_license_assistant.toJSON(),
			prompt: this.prompt,
			negative_prompt: this.negative_prompt,
			response_to_user: this.response_to_user,
			array_of_intent_detections: this.array_of_intent_detections,
			full_system_prompt: this.full_system_prompt,
			full_user_prompt: this.full_user_prompt,
			image_processing_mode: this.image_processing_mode,
			array_of_image_urls: this.array_of_image_urls,
		};
	}

	// Deserialization method
	static fromJSON(json: any): ChatVolley {
		return new ChatVolley(
			json.is_new_image,
			json.timestamp,
			json.user_input,
			json.prompt,
			json.negative_prompt,
			json.text_completion_response,
			json.response_to_user,
			json.chat_state_at_start_image_assistant === null
				? null
				: CurrentChatState_image_assistant.fromJSON(json.chat_state_at_start_image_assistant),
			json.chat_state_at_end_image_assistant === null
				? null
				: CurrentChatState_image_assistant.fromJSON(json.chat_state_at_end_image_assistant),
			json.chat_state_at_start_license_assistant === null
				? null
				: CurrentChatState_license_assistant.fromJSON(json.chat_state_at_start_license_assistant),
			json.chat_state_at_end_license_assistant === null
				? null
				: CurrentChatState_license_assistant.fromJSON(json.chat_state_at_end_license_assistant),
			json.array_of_intent_detections,
			json.full_system_prompt,
			json.full_user_prompt,
			json.image_processing_mode,
			json.array_of_image_urls,
		);
	}

	// -------------------- END  : SERIALIZATION METHODS ------------
}

// -------------------- END  : ChatVolley ------------

// -------------------- BEGIN: ChatHistory ------------

/**
 * Manages a collection of ChatVolley objects.
 */
export class ChatHistory {
	/**
	 * The chat volleys accumulated so far.
	 * @type {ChatVolley[]}
	 */
	public aryChatVolleys: ChatVolley[];

	/**
	 * The chatbot name this history belongs  to.
	 * @type {string}
	 */
	public chatbotName: string = '';

	/**
	 * Constructs an instance of ChatHistory.
	 *
	 * @param chatbotName - The name of the chatbot the history
	 *  belongs to.
	 */
	constructor(chatbotName: EnumChatbotNameValues) {
		this.aryChatVolleys = [];
		this.chatbotName = chatbotName;
	}

	/**
	 * Returns TRUE if aryChatVolleys is empty, FALSE if not.
	 *
	 * @returns {boolean} Whether the chat history is empty.
	 */
	public isHistoryEmpty(): boolean {
		return this.aryChatVolleys.length === 0;
	}

	/**
	 * Returns the last ChatVolley object in aryChatVolleys if not empty, otherwise returns null.
	 *
	 * @returns {ChatVolley | null} The last ChatVolley or null if history is empty.
	 */
	public getLastVolley(): ChatVolley | null {
		if (this.isHistoryEmpty()) {
			return null;
		}

		return this.aryChatVolleys[this.aryChatVolleys.length - 1];
	}

	/**
	 * Appends the newChatVolley object to the aryChatVolleys array.
	 *
	 * @param {ChatVolley} newChatVolley - The new ChatVolley to add.
	 */
	public addChatVolley(newChatVolley: ChatVolley): void {
		this.aryChatVolleys.push(newChatVolley);
	}

	/**
	 * Builds a pure text summary of the recent chat history
	 *  with the user, to be passed on to the LLM as part
	 *  of the prompt text.
	 *
	 * @param numChatVolleys - The number of chat volleys
	 *  to include in the history.  The most recent ones
	 *  will be chosen from the end of the array up to
	 *  the number available.  Pass in -1 if you want
	 *  the entire chat history.
	 */
	public buildChatHistoryPrompt(numChatVolleys: number = 4): string {
		if (numChatVolleys === -1) {
			numChatVolleys = this.aryChatVolleys.length;

			if (numChatVolleys <= 0)
				// No chat history at this time.
				return '';
		}

		if (numChatVolleys < 1)
			throw new Error(`The number of chat volleys must be greater than 0.`);
		if (!Number.isInteger(numChatVolleys))
			throw new Error(`The number of chat volleys must be an integer.`);

		let strChatHistory = ''

		if (this.aryChatVolleys.length > 0) {
			const aryChatVolleysSlice =
				this.aryChatVolleys.slice(-1 * numChatVolleys)

			const aryChatSummaries: string[] = [];

			aryChatVolleysSlice.forEach(
				obj => {
					aryChatSummaries.push(
						obj.buildChatVolleySummary_text())
				})

			const preamble =
				`
Below is your chat history with the user    

What they said to you is prefixed by the string "USER INPUT:"
  
Your response to their input is prefixed by the string "SYSTEM RESPONSE:"
  
Use the chat history to help guide your efforts.  Here it is now:
				`

			strChatHistory =
				preamble + aryChatSummaries.join('\n')
		}

		return strChatHistory
	}

	/**
	 * This function searches backwards from the end of the
	 *  chat history for the most recent chat volley that
	 *  has the is_new_session flag set to TRUE.  It then
	 *  builds a chat history string formatted as an LLM
	 *  annotated prompt, that includes:
	 *
	 *  	- The initial image description
	 *  	- The user requests to modify the image that followed,
	 *  		if any.
	 *      - And finally, the user input passed to this function.
	 *
	 * @returns - Returns the chat history for most recent
	 *  image session, starting from the initial image
	 *  description, up until the last chat volley, a
	 *  prompt ready formatted string, or NULL if a chat
	 *  volley with the is_new_session flag set to TRUE
	 *  could not be found.
	 */
	public buildChatHistoryLastImageOnly(userInput: string):StringOrNull {

		// There should always be current user input.
		if (userInput.trim().length < 1)
			throw new Error(`The userInput parameter is empty.`);


		// If there's no chat history yet, there's nothing to build.
		if (this.isHistoryEmpty()) {
			return null;
		}

		// Search backwards for the first chat volley
		//  we find that has the new session flag set to
		//  TRUE.
		let ndxFoundAt = -1;

		for (
				let ndxOfChatVolley = this.aryChatVolleys.length - 1; ndxOfChatVolley >= 0;
				ndxOfChatVolley--) {
			const chatVolleyObj = this.aryChatVolleys[ndxOfChatVolley];

			if (chatVolleyObj.is_new_session) {
				ndxFoundAt = ndxOfChatVolley;
				break;
			}

		}

		if (ndxFoundAt < 0) {
			// This should never happen, since this means
			//  somehow the original image description prompt
			//  was not entered into the chat history, or
			//  the is_new_session flag was not set to TRUE
			//  when it was.
			//
			// We don't throw an error in case the error occurred
			//  due to deletion or loss of our chat history files.

			// -------------------- BEGIN: EXIT POINT ------------

			const errMsg = `Unable to find any chat volley object with the is_new_session flag set to true.`;

			console.error(CONSOLE_CATEGORY, errMsg);

			return null;

			// -------------------- END  : EXIT POINT ------------
		} else {
			const originalImageDescription =
				this.aryChatVolleys[ndxFoundAt].user_input;

			const aryModifications: string[] = [];

			for (
					let ndx = ndxFoundAt + 1;
					ndx < this.aryChatVolleys.length;
					ndx++) {
				aryModifications.push(this.aryChatVolleys[ndx].user_input);
			}

			// IMPORTANT!  The labels used here MUST match those
			//  found in the intent detectors that look for
			//  them, like the extended wrong content detector!
			let chatHistoryForLastImage =
				`
				Here is the original image description that created the image:
				
				ORIGINAL IMAGE DESCRIPTION: ${originalImageDescription}
				`;

			if (aryModifications.length > 0) {
				const modificationsHistory =
					aryModifications.join('\n');

				chatHistoryForLastImage +=
					`
					Here is a list of modifications the user requested, in chronological order:
					`
				chatHistoryForLastImage += modificationsHistory;
			}

			chatHistoryForLastImage +=
				`
				Here is current user input from the user:
				
				USER FEEDBACK: ${userInput}
				`;

			return chatHistoryForLastImage;
		}
	}

	/**
	 * This function searches backwards from the end of the
	 *  chat history for the most recent chat volley that
	 *  has a CONTIGUOUS refinement iteration of count
	 *  with a 0 value.  It then returns the user input
	 *  from that chat volley if the start new image
	 *  flag is set in that volley, otherwise, it
	 *  returns the last full system prompt passed
	 *  to the image generator.
	 *
	 * STRATEGY: During a CONTIGUOUS refinement session,
	 *  where the user just keeps pressing the REFINE
	 *  button without intervening manual input,
	 *  the most recent chat volley with a zero
	 *  refinement iteration count contains the
	 *  original "primary" image prompt.  We check
	 *  the start new session flag because the user
	 *  input might contain an image modification or
	 *  feedback/complaint, instead of a base level
	 *  image description.
	 *
	 * @returns - Returns the chat volley that contains
	 *  the most recent base level image prompt the user
	 *  entered, or was created for them from the previous
	 *  manually entered user input during a manual input
	 *  chat volley.
	 */
	public getLastBaseLevelImagePrompt(): BaseLevelImageDescriptionPromptPair | null {

		// If there's no chat history yet, there's nothing to build.
		if (this.isHistoryEmpty()) {
			return null;
		}

		// Search backwards for the first chat volley
		//  we find that has the new session flag set to
		//  TRUE.
		let ndxFoundAt = -1;
		let chatVolleyFoundObj = null;

		for (
				let ndxOfChatVolley = this.aryChatVolleys.length - 1; ndxOfChatVolley >= 0;
				ndxOfChatVolley--) {
			const chatVolleyObj = this.aryChatVolleys[ndxOfChatVolley];

			if (chatVolleyObj.chat_state_at_end_image_assistant?.refinement_iteration_count === 0) {
				// Found the most recent chat volley with a 0
				//  refinement iteration count.
				ndxFoundAt = ndxOfChatVolley;
				chatVolleyFoundObj = chatVolleyObj;
				break;
			}
		}

		if (!chatVolleyFoundObj) {
			// This should never happen, since there should always
			//  be at least one chat volley with a refinement iteration
			//  count of 0.
			//
			// We don't throw an error in case the error occurred
			//  due to deletion or loss of our chat history files.

			// -------------------- BEGIN: EXIT POINT ------------

			const errMsg = `Unable to find any chat volley object with a refinement iteration count equal to 0.`;

			console.error(CONSOLE_CATEGORY, errMsg);

			return null;

			// -------------------- END  : EXIT POINT ------------
		} else {
			// Is the new session flag set, indicating a
			//  new image was started
			if (chatVolleyFoundObj.is_new_session) {
				// Return the user input and whatever was
				//  used for the negative prompt at the time.
				return {
					prompt: chatVolleyFoundObj.user_input,
					negative_prompt: chatVolleyFoundObj.negative_prompt
				}
			} else {
				return {
					// Return the LLM created prompt passed
					//  and whatever was used for the negative
					//  prompt at the time.
					prompt: chatVolleyFoundObj.prompt,
					negative_prompt: chatVolleyFoundObj.negative_prompt
				}
			}
		}
	}

	// -------------------- BEGIN: SERIALIZATION METHODS ------------

	// Serialization method
	public toJSON() {
		return {
			__type: 'ChatHistory',
			aryChatVolleys: this.aryChatVolleys.map(volley => volley.toJSON()),
		};
	}

	// Deserialization method
	static fromJSON(json: any): ChatHistory {
		const history = new ChatHistory(json.chatbotName);
		history.aryChatVolleys = json.aryChatVolleys.map((volley: any) => ChatVolley.fromJSON(volley));
		return history;
	}

	// -------------------- END  : SERIALIZATION METHODS ------------
}

// -------------------- END  : ChatHistory ------------

// -------------------- BEGIN: READ/WRITE ChatHistory OBJECTS ------------

/**
 * The directory where chat history files are stored.
 * @constant
 * @type {string}
 */
export const DIR_CHAT_HISTORY_FILES = 'chat-history-files';

/**
 * This enum holds the names of all the chatbots this
 *  system implements.
 */
export const EnumChatbotNames = {
	// The chatbot that helps the user craft image generation
	//  prompts.
	IMAGE_ASSISTANT: "image_assistant",
	// The chatbot that helps the user craft the license
	//  terms for their asset (e.g. - NFT).
	LICENSE_ASSISTANT: "license_assistant"
} as const;

/**
 * Type for the values of EnumChatbotNames (i.e., "image_assistant" | "license_assistant").
 */
export type EnumChatbotNameValues = typeof EnumChatbotNames[keyof typeof EnumChatbotNames];

// -------------------- BEGIN: IMAGE PROCESSING MODES ------------

export enum EnumImageProcessingModes {
	// User wants a new image.
	"NEW" = "new",
	// Fix problems with an images content.
	"REFINE" = "refine",
	// Enhance an image to make it more interesting.
	"ENHANCE" = "enhance"
}

// -------------------- END  : IMAGE PROCESSING MODES ------------

/**
 * Builds the full path to the user's chat history file.
 *
 * @param userId - The user ID to build the file name for.
 * @param chatbotName - The name of the chatbot the history
 *  belongs to.
 *
 * @returns {string} The full path to the user's chat history JSON file.
 *
 * @throws {Error} If the userId is empty or contains invalid characters for a file name.
 */
export function buildChatHistoryFilename(
		userId: string,
		chatbotName: EnumChatbotNameValues): string {
	const trimmedUserId = userId.trim();

	// Validate that the userId is not empty
	if (!trimmedUserId) {
		throw new Error('User ID cannot be empty.');
	}

	// Validate that the userId contains no invalid characters for a file name
	const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
	if (invalidChars.test(trimmedUserId)) {
		throw new Error('User ID contains invalid characters for a file name.');
	}

	// Get the subdirectory for chat history files.
	const resolvedFilePath =
		getCurrentOrAncestorPathForSubDirOrDie(CONSOLE_CATEGORY, DIR_CHAT_HISTORY_FILES);

	// Build the full path to the chat history file
	const primaryFileName = `${trimmedUserId}--${chatbotName}-chat-history.json`;

	// Construct the path dynamically
	const fullFilePath = path.join(resolvedFilePath, primaryFileName);

	return fullFilePath
}

// ***********************************************

/**
 * Writes the ChatHistory object to disk as a JSON file.
 *
 * @param {string} userId - The user ID associated with the chat history.
 * @param chatbotName - The name of the chatbot the history
 *  belongs to.
 *
 * @param {ChatHistory} chatHistory - The chat history object to write to disk.
 */
export function writeChatHistory(
		userId: string,
		chatHistory: ChatHistory,
		chatbotName: EnumChatbotNameValues
	): void {

	const filename = buildChatHistoryFilename(userId, chatbotName);
	const jsonData = JSON.stringify(chatHistory, null, 2);  // Pretty print the JSON

	writeJsonFile(filename, jsonData);
}

/**
 * Reads the chat history for a given user.
 *
 * @param {string} userId - The user ID whose chat history should be read.
 * @param chatbotName - The name of the chatbot the history
 *  belongs to.
 *
 * @returns {ChatHistory} The chat history object for the given user.  If one does not exist yet a brand new chat history object will be returned.
 */
export async function readChatHistory(
		userId: string,
		chatbotName: EnumChatbotNameValues): Promise<ChatHistory>  {
	const trimmedUserId = userId.trim()

	// Validate that the userId is not empty
	if (!trimmedUserId) {
		throw new Error('User ID cannot be empty.');
	}

	// Build the full path to the chat history file
	const fullPathToJsonFile = buildChatHistoryFilename(trimmedUserId, chatbotName);

	// Check if the file exists
	if (fs.existsSync(fullPathToJsonFile)) {
		// -------------------- BEGIN: LOAD EXISTING FILE ------------

		const jsonData = readJsonFile(fullPathToJsonFile);
		const parsedData = JSON.parse(jsonData);

		if (parsedData.__type === 'ChatHistory') {
			return ChatHistory.fromJSON(parsedData);
		} else {
			throw new Error("Invalid ChatHistory file format");
		}

		// -------------------- END  : LOAD EXISTING FILE ------------
	} else {
		// -------------------- BEGIN: BRAND NEW USER ------------

		return new ChatHistory(chatbotName)

		// -------------------- END  : BRAND NEW USER ------------
	}
}

/**
 * Returns a default StateType object with the fields initialized
 * to starting values. Allows passing in partial overrides for the state.
 *
 * @param overrides - An optional object that contains one or more fields from StateType to override the defaults.
 * @returns {StateType} - The default state with optional overrides.
 */
export function getDefaultState(overrides: Partial<StateType> = {}): StateType {
	// Default state object
	const defaultState: StateType = {
		streaming_audio: false,
		streaming_text: false,
		waiting_for_images: false,
		current_request_id: "",
		state_change_message: ""
	};

	// Return the merged object, with overrides replacing defaults where provided
	return { ...defaultState, ...overrides };
}


// -------------------- END  : UTILITY FUNCTIONS ------------