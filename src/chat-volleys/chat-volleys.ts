// This module contains the code and classes for maintaining
//  a chat history for a particular user.

// -------------------- BEGIN: DEFAULT IMAGE GENERATION VALUES ------------

// These are the default choices we make for various image
//  generation parameters.
import { getCurrentOrAncestorPathForSubDirOrDie, getUnixTimestamp } from "../common-routines"

import fs from "fs"
import path from "node:path"
import { readJsonFile, writeJsonFile } from "../json/json-file-substitute"
import { TextCompletionResponse } from "../openai-parameter-objects"
import {
	DEFAULT_GUIDANCE_SCALE,
	DEFAULT_IMAGE_GENERATION_MODEL_ID, DEFAULT_NUMBER_OF_IMAGE_GENERATION_STEPS,
	enumImageGenerationModelId,
	IntentJsonResponseObject,
} from "../enum-image-generation-models"
import { StateType } from "../system/types"

export type BooleanOrNull = boolean | null;
export type NumberOrNull = number | null;
export type StringOrNull = string | null;

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
	 * Constructs an instance of CurrentChatState_image_assistant.
	 *
	 * @param model_id - The model currently selected for image generation.
	 * @param loras - The LoRA object that has the currently selected, if any, LoRA models.
	 * @param guidance_scale - The current value set for the context free guidance parameter.
	 * @param steps - The current value set for the number of steps to use when generating an image.
	 */
	constructor(
			model_id: string,
			loras: object,
			guidance_scale: number,
			steps: number) {
		this.model_id = model_id;
		this.loras = loras;
		this.guidance_scale = guidance_scale;
		this.steps = steps;
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
				DEFAULT_NUMBER_OF_IMAGE_GENERATION_STEPS
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
		};
	}

	// Deserialization method
	static fromJSON(json: any): CurrentChatState_image_assistant {
		return new CurrentChatState_image_assistant(
			json.model_id,
			json.loras,
			json.guidance_scale,
			json.steps
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
	 * @param model_id - The model currently selected for _license_assistantlicense terms.
	 * @param loras - The LoRA object that has the currently selected, if any, LoRA models.
	 * @param guidance_scale - The current value set for the context free guidance parameter.
	 * @param steps - The current value set for the number of steps to use when generating an image.
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
	public full_prompt_to_system: string;

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
	 * The state of the chat at the start of the volley.
	 */
	public chat_state_at_start_image_assistant: CurrentChatState_image_assistant | null;

	/**
	 * The state of the chat at the end of the volley.
	 */
	public chat_state_at_end_image_assistant: CurrentChatState_image_assistant | null;

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
	 * Constructs an instance of ChatVolley.
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
	 * @param prompt - The prompt that was passed to the image generator model.
	 * @param negative_prompt - The negative prompt that was passed to the image generator model.
	 * @param text_completion_response - The whole response from the image generator prompt maker LLM.
	 * @param response_sent_to_client - The response we sent to the user via the client websocket connection.
	 * @param chat_state_at_start_image_assistant -  For image assistant chats, the state of the chat at the start of the volley.
	 * @param chat_state_at_end_image_assistant - For image assistant chats, the state of the chat at the end of the volley.
	 * @param chat_state_at_start_license_assistant - For license assistant chats, the state of the chat at the start of the volley.
	 * @param chat_state_at_end_license_assistant - For license assistant chats, the state of the chat at the end of the volley.
	 * @param array_of_intent_detections - Array of intent detections including complaint type and complaint text.
	 * @param full_prompt_to_system - The full prompt we sent to the LLM for consideration.
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
		full_prompt_to_system: string
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
		this.full_prompt_to_system = full_prompt_to_system;
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
			full_prompt_to_system: this.full_prompt_to_system
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
			json.full_prompt_to_system
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