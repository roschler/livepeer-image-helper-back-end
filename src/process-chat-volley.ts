// This module includes code for processing a chat volley.

import type WebSocket from "ws"
import {
	BaseLevelImageDescriptionPromptPair,
	ChatHistory,
	ChatVolley,
	CurrentChatState_image_assistant,
	CurrentChatState_license_assistant,
	EnumChatbotNames, EnumImageProcessingModes,
	PilTermsExtended,
	readChatHistory,
	writeChatHistory,
} from "./chat-volleys/chat-volleys"
import {
	DEFAULT_GUIDANCE_SCALE, DEFAULT_IMAGE_GENERATION_MODEL_ID, DEFAULT_NUMBER_OF_IMAGE_GENERATION_STEPS,
	enumImageGenerationModelId,
	IntentJsonResponseObject, MAX_GUIDANCE_SCALE, MAX_GUIDANCE_SCALE_PHOTOREALISTIC, MAX_STEPS,
} from "./enum-image-generation-models"
import {
	buildChatBotSystemPrompt_image_assistant,
	buildChatBotSystemPrompt_license_assistant,
	buildChatHistorySummary, g_DecomposeSentenceLogicPrompt,
	g_DescribeImagePrompt,
	g_ExtendedWrongContentPrompt, g_FixSuggestedUserFeedbackPrompt,
	g_ImageDescriptionVsActualImage,
	g_ImageGenPromptToTweetPrompt,
	g_ImageRefinementPrompt, g_MainImageGenerationFaqPrompt,
	g_ObjectShapeConsistencyPrompt,
	g_SuggestedUserFeedbackPrompt,
	g_TextCompletionParams,
	g_TextCompletionParamsForIntentDetector, g_TextCompletionParamsImageGeneration,
	g_TextCompletionParamsLicenseAssistant,
	g_VisionRecognitionParams,
	processAllIntents,
	readImageGenerationSubPromptOrDie,
	showIntentResultObjects,
} from "./openai-chat-bot"
import {
	enumChangeDescription,
	enumIntentDetectorId_image_assistant,
	enumIntentDetectorId_license_assistant,
	MIN_GUIDANCE_SCALE_IMAGE_TEXT_OR_WRONG_COMPLAINT_VALUE,
	MIN_STEPS,
	MIN_STEPS_FOR_IMAGE_ON_TEXT_OR_WRONG_CONTENT_COMPLAINT,
	NUM_GUIDANCE_SCALE_ADJUSTMENT_VALUE,
	NUM_STEPS_ADJUSTMENT_VALUE, NUM_TEMPERATURE_ADJUSTMENT_VALUE,
} from "./intents/enum-intents"
import {
	ImageGeneratorLlmJsonResponse,
	ImageGenPromptToTweetLlmJsonResponse,
	LicenseAssistantNuevoResponse,
} from "./openai-parameter-objects"
import {
	generateImages_chat_bot,
	sendImageMessage,
	sendJsonObjectMessage,
	sendStateMessage,
	sendTextMessage,
} from "./system/handlers"
import { ImageDimensions, StateType, StringOrNull, TwitterCardDetails } from "./system/types"
import {
	getImageFromS3Ext,
	putLivepeerImageToS3,
	putLivepeerImageToS3AsJpgExt,
} from "./aws-helpers/aws-image-helpers"
import { URL } from "url"
import { writeTwitterCardDetails } from "./twitter/twitter-helper-functions"
import {
	appendEosCharIfNotPresent,
	getCurrentOrAncestorPathForSubDirOrDie, getEnvironmentVariableByName,
	sendSimpleStateMessage,
	substituteWithoutEval,
	writeTextFile,
} from "./common-routines"
import axios from "axios"
import {
	sambaNovaChatCompletionImmediate,
	sambaNovaVisionRecognitionImmediate,
} from "./samba-nova-common"
import {
	convertImageBufferToBase64ImageUri,
	detectImageFormatFromUrl,
	ImagePackage,
} from "./image-processing/image-handling"
import {
	ObjectShapeToplevel,
	SambaNovaParams_text_completion,
} from "./samba-nova-parameter-objects"
import path from "node:path"
import fs from "fs"
import { g_AryPropertyDetails_main_image_gen_prompt } from "./json/json-custom-parse"

const CONSOLE_CATEGORY = 'process-chat-volley'

const bVerbose_process_chat_volley = true;

// These are the registered "simple" licenses Story Protocol
//  has made available to us.
export enum EnumStoryProtocolLicenses {
	NON_COMMERCIAL_SOCIAL_REMIXING = "Non-Commercial Social Remixing",
	COMMERCIAL_USE = "Commercial Use",
	COMMERCIAL_REMIX = "Commercial Remix"
}

// The directory where refinement log files should go.
const DIR_REFINEMENT_LOG_FILES = "refinement-logs";

// -------------------- BEGIN: MODEL LOCK FLAG ------------

// Set this to TRUE if you want to lock the stable diffusion
//  model to the faster "LIGHTNING" model.  This is useful
//  during testing when fast iterations are wanted.
const bIsStableDiffusionModelLocked = false;

console.info(CONSOLE_CATEGORY, `STABLE DIFFUSION MODEL LOCKED: ${bIsStableDiffusionModelLocked}`);


// -------------------- END  : MODEL LOCK FLAG ------------

// -------------------- BEGIN: HELPER FUNCTIONS ------------

// -------------------- BEGIN: INTENT DETECTOR RESULT ARRAY HELPER FUNCTIONS ------------

/**
 * Validates the boolean value for a given intent detector id and property name from an array of response objects.
 *
 * @param aryJsonResponseObjs - The array of intent detector JSON response objects to iterate over.
 * @param intentDetectorId - The intent detector ID to search for.
 * @param propName - The property name to check within the matching object.
 */
function getBooleanIntentDetectionValue(
	aryJsonResponseObjs: IntentJsonResponseObject[],
	intentDetectorId: string,
	propName: string
): boolean | null {
	// Validate intentDetectorId
	if (!intentDetectorId.trim()) {
		throw new Error('The intentDetectorId cannot be empty.');
	}

	// Validate propName
	if (!propName.trim()) {
		throw new Error('The propName cannot be empty.');
	}

	let retValue: boolean | null = null

	// Iterate over the extended JSON response objects
	for (const jsonResponseObjExt of aryJsonResponseObjs) {

		// Check if the object's intent_detector_id matches the provided intentDetectorId
		if (jsonResponseObjExt.intent_detector_id === intentDetectorId) {

			let arrayChildObjects = jsonResponseObjExt.array_child_objects;

			if (!Array.isArray(jsonResponseObjExt.array_child_objects)) {
				// Force single JSON objects to an array.
				if (typeof jsonResponseObjExt.array_child_objects === 'object')
					arrayChildObjects = [jsonResponseObjExt.array_child_objects];
				else
					throw new Error(`The array of child object property is not an array or a single object.`);
			}

			// Iterate its child objects and look for a child object
			//  with the desired property name.
			arrayChildObjects.forEach(
				(childObj) => {
					// Does the child object have a property with the desired
					//  name?
					const propValue = (childObj as any)[propName]

					if (typeof propValue !== 'undefined') {
						// Check if the value is boolean
						if (typeof propValue !== 'boolean') {
							throw new Error(`The property '${propName}' in the child object with intent_detector_id '${intentDetectorId}' is not boolean.`);
						}
					}

					// Found it.  We add the functionally unnecessary
					//  because Typescript is not figuring out due
					//  to the "undefined" check above, that propValue
					//  must be boolean at this point.
					retValue =
						typeof propValue === 'undefined'
							? null : propValue
				}
			)
		}
	}

	// If no object with the matching intentDetectorId is found,
	//  return NULL to let the caller know this.
	return retValue;
}

/**
 * Retrieves the string value for a given intent detector id
 *  and property name from an array of response objects.
 *
 * @param aryJsonResponseObjs - The array of JSON response objects to iterate over.
 * @param intentDetectorId - The intent detector ID to search for.
 * @param propName - The property name to check within the matching object.
 * @param linkedPropName - If not NULL, then the property value
 *  belonging to the linked property name given will be returned instead
 *  of the value belonging to the main property name.
 *
 * @returns - Returns the string value found in the object for
 *  the given intent detector ID and property, or null if no
 *  match is found.  Note, if a linked property name was given,
 *  and the main property name was found, the value belonging to
 *  the linked property will be returned instead.
 *
 */
function getStringIntentDetectionValue(
	aryJsonResponseObjs: IntentJsonResponseObject[],
	intentDetectorId: string,
	propName: string,
	linkedPropName: string | null
): string | boolean | number | null {
	// Validate intentDetectorId
	if (!intentDetectorId.trim()) {
		throw new Error('The intentDetectorId cannot be empty.');
	}

	// Validate propName
	if (!propName.trim()) {
		throw new Error('The propName cannot be empty.');
	}

	let retValue: string | null = null

	// Iterate over the extended JSON response objects
	for (const jsonResponseObjExt of aryJsonResponseObjs) {

		// Check if the object's intent_detector_id matches the provided intentDetectorId
		if (jsonResponseObjExt.intent_detector_id === intentDetectorId) {

			// Mitigate for single objects.
			let aryChildObjects =
				Array.isArray(jsonResponseObjExt.array_child_objects)
					? jsonResponseObjExt.array_child_objects
					: [ jsonResponseObjExt.array_child_objects ];

			// Iterate its child objects and look for a child object
			//  with the desired property name.
			aryChildObjects.forEach(
				(childObj) => {
					// Does the child object have a property with the desired
					//  name?
					let propValue = (childObj as any)[propName]

					if (typeof propValue !== 'undefined') {
						// Yes. Check if the value is a string
						if (typeof propValue !== 'string') {
							throw new Error(`The property '${propName}' in the child object with intent_detector_id '${intentDetectorId}' is not a string.`);
						}

						// Property value found.  Was a linked property
						//  name provided?
						if (linkedPropName) {
							// Get it's value.
							propValue = (childObj as any)[linkedPropName]

							// Yes. Check if the value is a string
							if (typeof propValue !== 'string' ) {
								// We automatically convert boolean and numeric values to strings.
								propValue = propValue.toString()
							} else {
								// throw new Error(`The linked property("${linkedPropName}) tied to property name("${propName}") in the child object with intent_detector_id '${intentDetectorId}' is not a string and could not be converted to one.`);
							}
						}
					}

					// Found it.  We add the functionally unnecessary
					//  "typeof propValue === 'undefined'"
					//  because Typescript is not figuring out due
					//  to the "undefined" check above, that propValue
					//  must be a string at this point.
					//
					// Once retValue has a valid value, we don't
					//  overwrite with another.
					if (retValue === null) {
						retValue =
							typeof propValue === 'undefined'
								? null : propValue
					}
				}
			)
		}
	}

	// If no object with the matching intentDetectorId is found,
	//  return NULL to let the caller know this.
	return retValue;
}

/**
 * Searches the array of JSON response objects for a JSON response
 * object that has the desired property name and the desired
 * property value to match.
 *
 * @param aryJsonResponseObjs - The array of JSON response objects to iterate over.
 * @param intentDetectorId - The intent detector ID to search for.
 * @param propName - The property name to check within the matching object.
 * @param desiredPropValue - The value we want to match for the property with
 *  the desire property name.

 * @returns {boolean} - Returns TRUE if a JSON response object has a child
 *  object with the desired property name and matching property value.
 *  FALSE if not.
 */
function isStringIntentDetectedWithMatchingValue(
	aryJsonResponseObjs: IntentJsonResponseObject[],
	intentDetectorId: string,
	propName: string,
	desiredPropValue: string
): boolean {
	// Validate intentDetectorId
	if (!intentDetectorId.trim()) {
		throw new Error('The intentDetectorId cannot be empty.');
	}

	// Validate propName
	if (!propName.trim()) {
		throw new Error('The propName cannot be empty.');
	}

	let retValue = false

	// Iterate over the extended JSON response objects
	for (const jsonResponseObjExt of aryJsonResponseObjs) {
		// Check if the object's intent_detector_id matches the provided intentDetectorId
		if (jsonResponseObjExt.intent_detector_id === intentDetectorId) {
			let arrayChildObjects = jsonResponseObjExt.array_child_objects;

			if (!Array.isArray(jsonResponseObjExt.array_child_objects)) {
				// Force single JSON objects to an array.
				if (typeof jsonResponseObjExt.array_child_objects === 'object')
					arrayChildObjects = [jsonResponseObjExt.array_child_objects];
				else
					throw new Error(`The array of child object property is not an array or a single object.`);
			}

			// Iterate its child objects and look for a child object
			//  with the desired property name.
			const bTestValue =
				arrayChildObjects.some(
					(childObj) => {
						// Does the child object have a property with the desired
						//  name?
						const propValue = (childObj as any)[propName]

						if (typeof propValue !== 'undefined') {
							// Check if the value is a string
							if (typeof propValue !== 'string') {
								throw new Error(`The property '${propName}' in the child object with intent_detector_id '${intentDetectorId}' is not a string.`);
							}
						}

						// Does it match the desired value?
						return propValue === desiredPropValue
					}
				)

			if (bTestValue) {
				// Once retValue is true, we don't "unset" it.
				if (!retValue)
					retValue = bTestValue
			}
		}
	}

	// If no object with the matching intentDetectorId is found,
	//  return NULL to let the caller know this.
	return retValue
}

// -------------------- END  : HELPER FUNCTIONS ------------

// -------------------- BEGIN: PROCESS **IMAGE** CHAT VOLLEY ------------

/**
 * This is the function that processes one chat volley
 *  for the license assistant.
 *
 * @param client - The client websocket we are servicing.
 * @param initialState - The initial state of the session
 *  at the top of this call, before we (may) alter it
 * @param userId_in - The user ID for the user we are
 *  chatting with.
 * @param userInput_in - The latest user input.
 * @param bStartNewLicenseTerms - If TRUE, then this is a
 *  new license terms session for a new NFT.  If FALSE, then
 *  we are continuing an existing license terms session.
 *
 * @returns - Returns TRUE if the user has indicated they
 *  are satisfied with the license terms, FALSE if not
 *  indicating the chat session should continue.
 */
export async function processLicenseChatVolley(
	client: WebSocket | null,
	initialState: StateType,
	userId_in: string,
	userInput_in: string,
	bStartNewLicenseTerms: boolean): Promise<boolean> {

	const bIsSimpleLicense = true;

	const userId = userId_in.trim()

	if (userId.length < 1)
		throw new Error(`The user ID is empty or invalid.`);

	const userInput = userInput_in.trim()

	if (userInput.length < 1)
		throw new Error(`The user input is empty or invalid.`);

	// >>>>> Status message: Tell the client we are thinking.
	if (client) {
		let newState = initialState

		// Set the "streaming" flag to trigger the
		//  client side spinner.
		newState.streaming_text = true;
		newState.state_change_message = 'Thinking...'

		sendStateMessage(client, newState)
	}

	// We need a starting chat state. If we have a
	//  chat history for the user, load it and use
	//  the last (most recent) chat volley object's
	//  ending state.  If not, create a default
	//  chat state object.
	//
	// Load the license chat history for the current user.
	const chatHistoryObj =
		await readChatHistory(userId, EnumChatbotNames.LICENSE_ASSISTANT);

	const chatVolley_previous =
		chatHistoryObj.getLastVolley()

	// const previousChatVolleyPrompt = chatVolley_previous?.prompt;

	const chatState_start =
		chatVolley_previous?.chat_state_at_start_license_assistant ?? CurrentChatState_license_assistant.createDefaultObject();

	// Make a clone of the starting chat state so that we can
	//  have it as a reference as we make state changes.
	const chatState_current =
		chatState_start.clone();

	// -------------------- BEGIN: DETERMINE USER INPUT TYPE ------------

	// First we need to ask the LLM if what kind of a reply
	//  have they made.  For now, the two types are:
	//
	// 		TYPE: query_for_information - a request for general information
	//		TYPE: form_fill_reply
	//
	// The array of intent detector JSON response objects
	//  will be put here.
	const aryIntentDetectorJsonResponseObjs: IntentJsonResponseObject[] = [];

	if (client) {
		let newState = initialState

		// Set the "streaming" flag to trigger the
		//  client side spinner.
		newState.streaming_text = true;
		newState.state_change_message = 'Thinking...'

		sendStateMessage(client, newState)
	}

	// -------------------- BEGIN: USER INPUT TYPE DETECTOR ------------

	// Run the user input by all intents.
	console.info(CONSOLE_CATEGORY, `Doing intents through SambaNova...`)

	// Add the chat history to the user prompt.
	let adornedUserInput = userInput;

	const strChatHistory = buildChatHistorySummary(chatHistoryObj, bStartNewLicenseTerms);

	if (strChatHistory)
		adornedUserInput += strChatHistory

	const aryIntentDetectResultObjs =
		await processAllIntents(
			Object.values(enumIntentDetectorId_license_assistant),
			g_TextCompletionParamsForIntentDetector,
			adornedUserInput)

	// Dump the user input to the console.
	console.info(CONSOLE_CATEGORY, `Adorned user input:\n\n\n${adornedUserInput}\n\n`)

	// Dump the results to the console.
	showIntentResultObjects(aryIntentDetectResultObjs);

	// If any of the results errored out, for now, we throw
	//  an error.
	//
	// TODO: Add recovery or mitigation code instead.
	if (aryIntentDetectResultObjs.some(
		(intentResultObj) =>
			intentResultObj.is_error === true
	)) {
		throw new Error(`One or more of the intent detector calls failed.`)
	}

	// Create an array of the intent detector JSON response
	//  objects.
	console.info(CONSOLE_CATEGORY, `Creating an array of intent detector JSON responses objects.`)

	aryIntentDetectResultObjs.forEach(
		(intentResultObj) => {
			// Merge the intent detector ID into the
			//  JSON response object.
			const jsonResponseObj = {
				intent_detector_id: intentResultObj.result_or_error.intent_detector_id,
				array_child_objects: intentResultObj.result_or_error.json_response
			}

			aryIntentDetectorJsonResponseObjs.push(jsonResponseObj)
		}
	)

	if (aryIntentDetectorJsonResponseObjs.length < 1)
		throw new Error(`The array of intent detectors JSON response objects is empty.`);

	// Show the user reply type.
	let userReplyType =
		getStringIntentDetectionValue(
			aryIntentDetectorJsonResponseObjs,
			enumIntentDetectorId_license_assistant.DETERMINE_USER_INPUT_TYPE,
			'user_input_type',
			null
		);

	// Check to see if the user reply was actually a reference to
	//  a license term.
	let licenseTermValue = null;
	let originalUserReplyType =
		userReplyType;

	const licenseTermSpecified =
		getStringIntentDetectionValue(
			aryIntentDetectorJsonResponseObjs,
			enumIntentDetectorId_license_assistant.DETECT_USER_INPUT_AS_LICENSE_TERM,
			'license_term',
			null
		);

	// If the user specified a specific license term, then override
	//  the reply type.
	if (licenseTermSpecified) {
		userReplyType = "form_fill_reply"

		// Get the detected value.
		licenseTermValue =
			getStringIntentDetectionValue(
				aryIntentDetectorJsonResponseObjs,
				enumIntentDetectorId_license_assistant.DETECT_USER_INPUT_AS_LICENSE_TERM,
				'license_term',
				'license_term_value'
			);

		console.info(CONSOLE_CATEGORY, `licenseTermSpecified: ${licenseTermSpecified}`)
		console.info(CONSOLE_CATEGORY, `userReplyType forced to: ${userReplyType}`)
	} else {
		console.info(CONSOLE_CATEGORY, `userReplyType: ${userReplyType}`)
	}

	// -------------------- END  : DETERMINE USER INPUT TYPE ------------


	// TODO: STOP FORCING EVERYTHING TO "form_fill_reply"
	userReplyType = "form_fill_reply"

	// -------------------- BEGIN: SELECT SUB-ASSISTANT ------------

	// Now that we know the type of user input it is, run it by
	//  the correct SUB-ASSISTANT.
	let subAssistantPromptText: StringOrNull = null;

	// Build the system prompt for the sub-assistant that handles
	//  this kind of user input.
	if (userReplyType === "form_fill_reply") {
		// -------------------- BEGIN: FORM FILL SUB-ASSISTANT ------------

		// For now, we read in the contents of the license terms
		//  system prompt, so we can edit it and change the
		//  behavior of the system without having to restart
		//  the back-end server.
		//
		// TODO: Make this and the other sub-assistant prompt text loads
		//  a one-time read on start up.
		subAssistantPromptText =
			readImageGenerationSubPromptOrDie('system-prompt-for-license-assistant-form-fill-agent.txt');


		// -------------------- END  : FORM FILL SUB-ASSISTANT ------------
	} else if (userReplyType === "query_for_information") {
		// -------------------- BEGIN: LIBRARIAN SUB-ASSISTANT ------------

		subAssistantPromptText =
			readImageGenerationSubPromptOrDie('system-prompt-for-license-assistant-librarian.txt');

		// -------------------- END  : LIBRARIAN SUB-ASSISTANT ------------
	} else {
		throw new Error(`Don't know how to handle a user reply type of:${userReplyType}`);
	}

	// -------------------- END  : SELECT SUB-ASSISTANT ------------

	// -------------------- BEGIN: MAKE THE SUB-ASSISTANT TEXT COMPLETION CALL ------------

	const systemAndUserPromptToLLM =
		buildChatBotSystemPrompt_license_assistant(
			userInput,
			userReplyType,
			subAssistantPromptText,
			chatHistoryObj,
			bStartNewLicenseTerms,
			8
		)

	// Get the response from the LLM.
	console.info(CONSOLE_CATEGORY, `>>>>> Making main LLM text completion request <<<<<`)

	// Write out the last prompt pair for debugging purposes.
	writeTextFile('./DUMP-PROMPTS.TXT', systemAndUserPromptToLLM.systemPrompt + '\n\n' +
		systemAndUserPromptToLLM.userPrompt)

	if (client) {
		let newState = initialState

		// Set the "streaming" flag to trigger the
		//  client side spinner.
		newState.streaming_text = true;
		newState.state_change_message = 'Considering license choices...'

		sendStateMessage(client, newState)
	}

	const textCompletion =
		await sambaNovaChatCompletionImmediate(
			userReplyType,
			systemAndUserPromptToLLM.systemPrompt,
			systemAndUserPromptToLLM.userPrompt,
			// g_TextCompletionParams,
			g_TextCompletionParamsLicenseAssistant,
			true,
			null);

	if (textCompletion.is_error)
		throw new Error(`The sub-assistant LLM returned the following error:\n\n${textCompletion.error_message}`);

	console.info(`textCompletion.text_response object:`);
	console.dir(textCompletion.text_response, {depth: null, colors: true});

	// Get the JSON object returned to us.
	const nuevoLicenseLLMResponse: LicenseAssistantNuevoResponse =
		textCompletion.json_response as LicenseAssistantNuevoResponse;

	/*
	if (userReplyType === "query_for_information" || originalUserReplyType === "query_for_information") {
		// The librarian sub-assistant insists on giving simple text answers, so
		//  we make a JSON response object from it.
		const synthesizeJsonResponseObj: LicenseTermsLlmJsonResponse =
			{
				system_prompt: textCompletion.text_response,
				isUserSatisfiedWithLicense: false,
				pil_terms: null,
				license_terms_explained: ''
			}

		jsonResponseObj = synthesizeJsonResponseObj;

		console.info(textCompletion.text_response);
	} else {
		if (bIsSimpleLicense) {
			jsonResponseObj = nuevoLicenseLLMResponse;
		} else {
			jsonResponseObj =
				textCompletion.json_response as LicenseTermsLlmJsonResponse;
		}

		console.info(`jsonResponseObj object:`);
		console.dir(jsonResponseObj, {depth: null, colors: true});
	}
	 */

	// -------------------- END  : MAKE THE SUB-ASSISTANT TEXT COMPLETION CALL ------------

	// -------------------- BEGIN: UPDATE CHAT HISTORY PILTERMS STATE ------------

	if (bIsSimpleLicense) {
		// STUB
	} else {
		/*
		if (jsonResponseObj.pil_terms) {
			// Update the current chat state with the updated PilTerms object.
			chatState_current.pilTerms = jsonResponseObj.pil_terms as PilTermsExtended;

			console.info(`jsonResponseObj object:`);
			console.dir(jsonResponseObj, { depth: null, colors: true });
		}
		 */
	}

	// -------------------- END  : UPDATE CHAT HISTORY PILTERMS STATE ------------

	console.info(`--------->>>>>>>>>> User input type: ${userReplyType}`)


	/*
	console.info(`// -------------------- BEGIN: CHAT VOLLEY ------------`)

	console.info(`jsonResponseObj object:`);
	console.dir(jsonResponseObj, {depth: null, colors: true});

	console.info(`// -------------------- END  : CHAT VOLLEY ------------`)
	 */

	// -------------------- BEGIN: UPDATE PILTERMS OBJECT ------------

	// -------------------- END  : UPDATE PILTERMS OBJECT ------------

	// -------------------- BEGIN: UPDATE CHAT HISTORY ------------

	const newChatVolleyObj =
		new ChatVolley(
			false,
			null,
			userInput,
			'',
			'',
			textCompletion,
			textCompletion.text_response,
			null,
			null,
			chatState_start,
			chatState_current,
			aryIntentDetectorJsonResponseObjs,
			systemAndUserPromptToLLM.systemPrompt + ' <=> ' + systemAndUserPromptToLLM.userPrompt,
			systemAndUserPromptToLLM.userPrompt,
			'', // Image processing mode is not applicable to the license. assistant
			[]
		);

	chatHistoryObj.addChatVolley(newChatVolleyObj);

	// Update storage.
	writeChatHistory(userId, chatHistoryObj, EnumChatbotNames.LICENSE_ASSISTANT)

	// -------------------- END  : UPDATE CHAT HISTORY ------------

	// -------------------- BEGIN: MAKE THE LICENSE EXPLAINER CALL ------------

	let textCompletionExplainer = null;

	let licenseTermsExplanation =
		'Your license terms will appear here...';

	if (bIsSimpleLicense) {
		// Once the LLM has some confidence in their
		//  license choice out of the 3 simple
		//  licenses, we will show the overview
		//  text as the explanation text.
		if (["MEDIUM", "HIGH", "VERY HIGH"].includes(nuevoLicenseLLMResponse.confidence)) {
			if (nuevoLicenseLLMResponse.best_license_guess === EnumStoryProtocolLicenses.NON_COMMERCIAL_SOCIAL_REMIXING) {

				licenseTermsExplanation = `LICENSE TYPE: Non-Commercial Social Remixing\n\nAllows others to remix your work. This license allows for endless free remixing while tracking all uses of your work while giving you full credit. Similar to: TikTok plus attribution.
				`;
			} else if (nuevoLicenseLLMResponse.best_license_guess === EnumStoryProtocolLicenses.COMMERCIAL_USE) {
				licenseTermsExplanation = `LICENSE TYPE: Commercial Use\n\nOVERVIEW: Retain control over reuse of your work, while allowing anyone to appropriately use the work in exchange for the economic terms you set. This is similar to Shutterstock with creator-set rules.
				`;
			} else if (nuevoLicenseLLMResponse.best_license_guess === EnumStoryProtocolLicenses.COMMERCIAL_REMIX) {
				licenseTermsExplanation =
					`LICENSE TYPE: Commercial Remix\n\nOVERVIEW: The world can build on your creation while you earn money from it! This license allows for endless free remixing while tracking all uses of your work while giving you full credit, with each derivative paying a percentage of revenue to its "parent" intellectual property.
					`;
			} else {
				throw new Error(`Unknown license type.`);
			}
		}

	} else {
		// -------------------- BEGIN: FULL PILTERMS EXPLAINER ------------

		/* eslint-disable */
		function removeNullProperties(obj: Record<string, any>): Record<string, any> {
			const newObj: Record<string, any> = {};

			for (const key in obj) {
				if (obj[key] !== null) {
					newObj[key] = obj[key];
				}
			}

			return newObj;
		}
		/* eslint-enable */

		if (chatState_current.pilTerms) {

			const licenseExplainerSystemPromptText =
				readImageGenerationSubPromptOrDie('system-prompt-for-license-assistant-explainer.txt');

			if (licenseExplainerSystemPromptText.length < 1)
				throw new Error(`The explainer license system prompt text is empty.`);

			const pilTermsNoNulls =
				removeNullProperties(chatState_current.pilTerms);

			// If the object has all NULL properties, don't
			//  bother creating a license terms explanation.
			if (Object.keys(pilTermsNoNulls).length > 0) {

				// The latest PilTerms object with null properties
				//  removed is the user input.
				const pilTermsAsUserInput =
					JSON.stringify(pilTermsNoNulls);

				// Make the text completion call to the license explainer.
				textCompletionExplainer =
					await sambaNovaChatCompletionImmediate(
						'LICENSE-ASSISTANT-EXPLAINER',
						licenseExplainerSystemPromptText,
						pilTermsAsUserInput,
						g_TextCompletionParams,
						false,
						null);

				if (textCompletionExplainer.is_error)
					throw new Error(`The license assistant explainer LLM returned the following error:\n\n${textCompletionExplainer.error_message}`);
			}

			if (textCompletionExplainer && textCompletionExplainer.text_response) {
				licenseTermsExplanation = textCompletionExplainer.text_response;
			}
		}
		// -------------------- END  : FULL PILTERMS EXPLAINER ------------
	}



	// -------------------- END  : MAKE THE LICENSE EXPLAINER CALL ------------

	// -------------------- BEGIN: RETURN RESPONSE ------------

	// Now send the response message to the client.
	if (client) {
		let newState = initialState

		newState.state_change_message = 'New response...'

		// Clear the "streaming" flag to remove the
		//  client side spinner.
		newState.streaming_text = false;

		sendStateMessage(
			client,
			newState
		)

		// Add the current license terms explanation text to
		//  the payload.
		nuevoLicenseLLMResponse.license_terms_explained =
			licenseTermsExplanation

		sendJsonObjectMessage(
			client,
			{
				json_type: "license_response",
				json_object: nuevoLicenseLLMResponse
			}
		)
	}


	// -------------------- END  : RETURN RESPONSE ------------

	// Use "license_response" as the response payload type along
	// with a LicenseType payload.
	return true
}

// -------------------- END  : PROCESS **IMAGE** CHAT VOLLEY ------------


// -------------------- BEGIN: BASE LEVEL SAMBA NOVA TEXT COMPLETIONS TEST ------------

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

// -------------------- END  : BASE LEVEL SAMBA NOVA TEXT COMPLETIONS TEST ------------

// -------------------- BEGIN: DO ONE VISION RECOGNITION CALL ------------

/**
 * Does one vision recognition call.
 *
 * @param systemPrompt - The system prompt to use with the
 *  vision recognition call.
 * @param imagePackage - The image package that contains the
 *  image to process.
 *
 * @returns - Returns the image description generated by the
 *  vision recognition model.
 */
async function doVisionRecognitionCall(
	systemPrompt: string,
	imagePackage: ImagePackage): Promise<string> {

	if (systemPrompt.length < 1) {
		throw new Error(`The system prompt for the vision recognition call must not be empty.`);
	}

	// Get a description of the last generated image from the
	//  vision recognition model.

	/*
	const aryVisionRecognitionResultObjs =
		await sambaNovaProcessAllVisionRecognitions(
			'VISION-RECOGNITION',
			systemPrompt,
			g_VisionRecognitionParams,
			[newImagePackage]
		);

	if (!Array.isArray(aryVisionRecognitionResultObjs) || aryVisionRecognitionResultObjs.length !== 1) {
		throw new Error(`The array of vision recognition objects is empty or invalid.`);
	}

	const visionRecognitionObj = aryVisionRecognitionResultObjs[0];

	 */

	let intentId = 'VISION-RECOGNITION';
	let resultObj;

	try {
		const result =
			await sambaNovaVisionRecognitionImmediate(
				intentId,
				systemPrompt,
				g_VisionRecognitionParams,
				// We pass the URL to our S3 image URL for
				//  use by the vision recognition model.
				imagePackage.urlToOurS3Image,
				// We base the image data in base 64 encoded string format.
				imagePackage.base64EncodedImageString,
				// The vision recognition model returns just
				//  a text response.
				false,
				null);
		resultObj = { is_error: false, intent_id: intentId, result_or_error: result }; // Successful result
	} catch (error) {
		resultObj = { is_error: true, intent_id: intentId, result_or_error: error }; // Capture error in the result object
	}

	if (resultObj.is_error) {
		throw new Error(`The vision recognition model returned a top level error response:\n\n${resultObj.result_or_error.error_message}`);
	}

	return resultObj.result_or_error.text_response.trim();
}

// -------------------- END  : DO ONE VISION RECOGNITION CALL ------------

// -------------------- BEGIN: MAIN FUNCTION ------------

/**
 * Converts an S3 URL into a safe filename by replacing
 *  any characters that are not compatible with Windows
 *  or Linux filenames with underscores.
 *
 * @param {string} s3Url - The S3 URL to be converted
 *  to a safe filename.
 *
 * @returns {string} A filename-safe string derived from the S3 URL.
 */
function s3UrlToSafeFilename(s3Url: string): string {
	if (typeof s3Url !== 'string' || s3Url.trim() === '') {
		throw new Error('Invalid input: s3Url must be a non-empty string');
	}

	// Remove protocol (http/https) and replace any unsafe characters with underscores
	const safeS3UrlAsFilename = s3Url
		.replace(/^https?:\/\//, '')  // Remove protocol prefix
		.replace(/[^a-zA-Z0-9-_\.]/g, '_');  // Replace non-safe characters with underscores

	return safeS3UrlAsFilename.trim();
}

// Example usage:
// const safeFilename = s3UrlToSafeFilename("https://bucket-name.s3.amazonaws.com/path/to/file.jpg");
// console.log(safeFilename); // Outputs a filename-safe version of the S3 URL

/**
 * Builds the full path to the user's chat history file.
 *
 * @param s3Url - The S3 URL to the image being refined.
 *
 * @returns {string} The full path to a refinement history
 *  TEXT file.
 */
export function buildRefinementLogFilename(
	s3Url: string): string {

	// Validate that the S3 URL is not empty
	if (!s3Url) {
		throw new Error('S3 URL cannot be empty.');
	}

	// Make the S3 URL safe to use as a file name.
	const s3UrlAsSafeFilename =
		s3UrlToSafeFilename(s3Url);

	// Get the subdirectory for chat history files.
	const resolvedFilePath =
		getCurrentOrAncestorPathForSubDirOrDie(CONSOLE_CATEGORY, DIR_REFINEMENT_LOG_FILES);

	// Build the full path to the chat history file
	const primaryFileName = `${s3UrlAsSafeFilename}-refinement-log.txt`;

	// Construct the path dynamically
	const fullFilePath = path.join(resolvedFilePath, primaryFileName);

	console.info(CONSOLE_CATEGORY, `(buildRefinementLogFilename) Full file path constructed:\n${fullFilePath}`);

	return fullFilePath;
}

// -------------------- BEGIN: REFINEMENT TEXT COMPLETION JSON RESPONSE ------------

export interface RefineTextCompletionJsonResponse
{
	"prompt": string;
	"negative_prompt": string;
	"user_input_has_complaints": boolean;
}

// -------------------- END  : REFINEMENT TEXT COMPLETION JSON RESPONSE ------------

// -------------------- BEGIN: REFINEMENT RESPONSE INTERFACE ------------

// This described the result object of doRefinement_2.

export interface RefinementResponse {
	// The emulated user feedback that could result from
	//  a user reacting to the discrepancies in the last
	//  generated image.
	suggestedUserFeedback: string;
	// The brand new, revised created for the next
	//  image generation (this one).
	finalRefinementPrompt: string;
	// The brand new, revised NEGATIVE prompt for the next
	//  image generation (this one).
	finalRefinementNegativePrompt: string;
}

// -------------------- END  : REFINEMENT RESPONSE INTERFACE ------------

/**
 * This is our second attempt at trying to create a refined
 *  image prompt automatically, without user intervention.
 *
 * @param userId - The ID of the current suer.
 * @param originalUserInput - Their original input from
 *  the last chat volley.  Note, it may be in reality
 *  the previous auto image refinement prompt.
 * @param baseLevelImageDescription - The most recent
 *  base level image description for this refinement
 *  session.
 * @param urlToActiveImageInClient - The URL to the
 *  current image of interest.
 * @param chatHistoryObj - The chat history for the
 *  given user ID.
 * @param funcLogMessage - A function to call to
 *  post log messages to.
 */
async function doRefinement_2(
	userId: string,
	originalUserInput: string,
	baseLevelImageDescription: string,
	urlToActiveImageInClient: string,
	chatHistoryObj: ChatHistory,
	funcLogMessage: Function
): Promise<RefinementResponse> {
	if (userId.length < 1)
		throw new Error(`The user ID input parameter is empty.`);
	if (urlToActiveImageInClient.length < 1)
		throw new Error(`The URL to the active image parameter is empty.`);
	if (userId.length < 1)
		throw new Error(`The user ID input parameter is empty.`);

	const chatVolley_previous =
		chatHistoryObj.getLastVolley();

	if (!chatVolley_previous)
		throw new Error(`The chat history object is unassigned.`);

	if (baseLevelImageDescription.length < 1)
		throw new Error(`The base level image description is empty..`)

	let aryRefinementLogMsgs: string[] = [];
	let refinementLogMsg = `originalUserInput:\n\n${originalUserInput}`;
	funcLogMessage(refinementLogMsg);
	aryRefinementLogMsgs.push(refinementLogMsg);

	// -------------------- BEGIN: MAIN VISION RECOGNITION CALL ------------

	// Create a log file to track the progress of this refinement
	//  session.
	const refinementLogFilename = buildRefinementLogFilename(urlToActiveImageInClient);

	console.info(CONSOLE_CATEGORY, `Retrieving image from S3.`);

	// Build an image package object around the URL to
	//  the image we are refining.  This URL must be
	//  one of our S3 bucket image URLs.
	// const imageFormat =
	//	detectImageFormatFromUrl(urlToActiveImageInClient);

	const newImagePackage =
		await getImageFromS3Ext(urlToActiveImageInClient);

	console.info(CONSOLE_CATEGORY, `S3 retrieval call finished.`);

	if (!newImagePackage)
		// The S3 image URL is invalid.
		throw new Error(`Invalid S3 image URL passed to auto image refinement session request:\n\n${urlToActiveImageInClient}`);

	let imageDescription =
		await doVisionRecognitionCall(g_DescribeImagePrompt, newImagePackage);

	refinementLogMsg = `Image description from vision recognition model:\n\n${imageDescription}`;
	funcLogMessage(refinementLogMsg);
	aryRefinementLogMsgs.push(refinementLogMsg);

	// -------------------- END  : MAIN VISION RECOGNITION CALL ------------

	// -------------------- BEGIN: IMAGE DISCREPANCY VISION RECOGNITION CALL ------------

	//  Note, this variable must have the same name
	//   as that used in the discrepancies prompt.
	let enhancedPrompt = chatVolley_previous?.prompt + '\n';

	refinementLogMsg = `g_ImageDescriptionVsActualImage:\n\n${g_ImageDescriptionVsActualImage}`;
	funcLogMessage(refinementLogMsg, true);
	aryRefinementLogMsgs.push(refinementLogMsg);

	// We need to insert the enhanced prompt and image
	//  description into the image discrepancies prompt
	//  text.
	const fullImageDescriptionVsActualImagePrompt =
		// eval('`' + g_ImageDescriptionVsActualImage + '`');
		substituteWithoutEval(g_ImageDescriptionVsActualImage, (varName) => eval(varName));

	refinementLogMsg = `fullImageDescriptionVsActualImagePrompt:\n\n${fullImageDescriptionVsActualImagePrompt}`;
	funcLogMessage(refinementLogMsg);
	aryRefinementLogMsgs.push(refinementLogMsg);

	// Now ask the vision recognition model if the image matches this
	//  enhanced prompt (aka, the "desired" image).
	const imageDiscrepanciesDescription =
		await doVisionRecognitionCall(
			fullImageDescriptionVsActualImagePrompt,
			newImagePackage);

	refinementLogMsg = `The image DISCREPANCIES description is:\n\n${imageDiscrepanciesDescription}`;
	funcLogMessage(refinementLogMsg);
	aryRefinementLogMsgs.push(refinementLogMsg);

	// -------------------- END  : IMAGE DISCREPANCY VISION RECOGNITION CALL ------------

	// -------------------- BEGIN: SUGGESTED USER FEEDBACK ------------

	// We need to insert the image discrepancies report into
	//  suggested user feedback prompt text.
	const fullSuggestedUserFeedbackImagePrompt =
		// eval('`' + g_SuggestedUserFeedbackPrompt + '`');
		substituteWithoutEval(g_SuggestedUserFeedbackPrompt, (varName) => eval(varName));

	refinementLogMsg = `fullSuggestedUserFeedbackImagePrompt:\n\n${fullSuggestedUserFeedbackImagePrompt}`;
	funcLogMessage(refinementLogMsg, true);
	aryRefinementLogMsgs.push(refinementLogMsg);

	// Making the text completion call to get the suggested
	//  user feedback.  We need to increase the temperature
	//  so that the LLM has the freedom to create the suggested
	//  user feedback.
	const suggestedUserFeedbackParams =
		new SambaNovaParams_text_completion({ temperature_param_val: 0.5 });

	const textCompletion_suggested_feedback =
		await sambaNovaChatCompletionImmediate(
			'SUGGESTED-USER-FEEDBACK',
			fullSuggestedUserFeedbackImagePrompt,
			'<end>', // The system prompt contains all the needed information.
			suggestedUserFeedbackParams,
			false,
			null);

	if (textCompletion_suggested_feedback.is_error)
		throw new Error(`The suggested user feedback call failed with error: ${textCompletion_suggested_feedback.error_message}`);

	const suggestedUserFeedback =
		textCompletion_suggested_feedback.text_response;

	refinementLogMsg = `suggestedUserFeedback:\n\n${suggestedUserFeedback}`;
	funcLogMessage(refinementLogMsg);
	aryRefinementLogMsgs.push(refinementLogMsg);

	// -------------------- END  : SUGGESTED USER FEEDBACK ------------

	// Write the log message.
	const refineLogContent =
		aryRefinementLogMsgs.join('\n\n');

	writeTextFile(refinementLogFilename, refineLogContent);

	console.info(CONSOLE_CATEGORY, `REFINEMENT LOG CONTENT WRITTEN TO FILE:\n\n${refinementLogFilename}`);

	// Extract the summary.
	const suggestedUserFeedbackSummary = suggestedUserFeedback.match(/\[(.*?)\]/)?.[1] || "";
	console.log(suggestedUserFeedbackSummary);

	// -------------------- BEGIN: REWRITE PROMPT ------------

	// Apparently we need to reference g_MainImageGenerationFaqPrompt
	//  or the global variable reference will not be available to the
	//  substituteWithoutEval() function.
	const mainImageGenerationFaqPrompt = g_MainImageGenerationFaqPrompt;

	// Create a new prompt given these 3 pieces of information
	//  using the refinement prompt.  First, we need to
	//  insert them into the full prompt to the
	//  image refinement system prompt.
	const fullImageRefinementPrompt =
		// eval('`' + g_ImageRefinementPrompt + '`');
		substituteWithoutEval(g_ImageRefinementPrompt, (varName) => eval(varName));

	refinementLogMsg = `fullImageRefinementPrompt:\n\n${fullImageRefinementPrompt}`;
	funcLogMessage(refinementLogMsg, true);
	aryRefinementLogMsgs.push(refinementLogMsg);

	const rewritePromptParams =
		new SambaNovaParams_text_completion({ temperature_param_val: 0.5 });

	const textCompletion_final_refinement =
		await sambaNovaChatCompletionImmediate(
			'REWRITE-PROMPT',
			fullImageRefinementPrompt,
			'Please give me a prompt that fixes the current problems with the image.',
			rewritePromptParams,
			true,
			null);

	if (textCompletion_final_refinement.is_error)
		throw new Error(`The suggested user feedback call failed with error: ${textCompletion_final_refinement.error_message}`);

	// NOTE: This variable is used by the
	//  system prompt to fix scene logic errors
	//  introduced in the rewritten prompt.
	const rewrittenPromptResponse =
		textCompletion_final_refinement.text_response;

	// -------------------- END  : REWRITE PROMPT ------------

	// -------------------- BEGIN: FIX SUGGESTED USER FEEDBACK ------------

	// This text completion call attempts to fix scene logic
	//  changes found in the suggested user feedback and to
	//  restore the scene logic expressed in the image
	//  discrepancy report.

	// Create a new prompt given these 3 pieces of information
	//  using the refinement prompt.  First, we need to
	//  insert them into the full prompt to the
	//  image refinement system prompt.
	const fullFixSuggestedUserFeedbackPrompt =
		substituteWithoutEval(g_FixSuggestedUserFeedbackPrompt, (varName) => eval(varName));

	refinementLogMsg = `fullFixSuggestedUserFeedbackPrompt:\n\n${fullFixSuggestedUserFeedbackPrompt}`;
	funcLogMessage(refinementLogMsg, true);
	aryRefinementLogMsgs.push(refinementLogMsg);

	const fixSuggestedUserFeedbackParams =
		new SambaNovaParams_text_completion({ temperature_param_val: 0.3 });

	const textCompletion_fix_suggested_user_feedback =
		await sambaNovaChatCompletionImmediate(
			'FIX-SUGGESTED-USER-FEEDBACK',
			fullFixSuggestedUserFeedbackPrompt,
			'Please give me a prompt that fixes the scene logic errors found in the current prompt text.',
			fixSuggestedUserFeedbackParams,
			true,
			null);

	if (textCompletion_fix_suggested_user_feedback.is_error)
		throw new Error(`The call to fix the suggested user feedback prompt failed with error: ${textCompletion_final_refinement.error_message}`);

	const jsonRefinementResponseObj =
		// textCompletion_fix_suggested_user_feedback.text_response;
		textCompletion_fix_suggested_user_feedback.json_response as RefineTextCompletionJsonResponse;

	refinementLogMsg = `Refinement response prompt:\n\n${jsonRefinementResponseObj.prompt}`;
	funcLogMessage(refinementLogMsg, true);
	aryRefinementLogMsgs.push(refinementLogMsg);

	refinementLogMsg = `Refinement response NEGATIVE prompt:\n\n${jsonRefinementResponseObj.negative_prompt}`;
	funcLogMessage(refinementLogMsg, true);
	aryRefinementLogMsgs.push(refinementLogMsg);

	// -------------------- END  : FIX SUGGESTED USER FEEDBACK ------------

	return {
		suggestedUserFeedback: suggestedUserFeedback,
		finalRefinementPrompt: jsonRefinementResponseObj.prompt,
		finalRefinementNegativePrompt: jsonRefinementResponseObj.negative_prompt
	}
}

// The Flux and ByteDance models use dual encoders.
/*
 From Brad an SPE in the Livepeer network.

 Flux uses two text encoders, one is a "Clip" encoder
  and the second is closer to an LLM called T5.
  The Clip encoder is also used on SDXL and SD3
  pipelines with the same limitation of 77 tokens.
  T5 model has much larger limit (256 for Flux Schnell
  and 512 for SD3).

To take advantage of this, we pass a summary of the full
  prompt before the "|" delimiter, to the Clip encoder,
  and the full summary to the T5 encoder.  However,
  the LLM is inconsistent which field gets the shorter
  value.  That is why we use this function to assemble
  the dual prompt.
*/

/**
 * Build a dual encoder prompt by concatenating the shorter
 *  of the two prompt fields with the longer of the fields.
 *
 * @param jsonResponse - The response from the LLM with
 *  the image generation prompt details.
 */
function buildDualEncoderPrompt(jsonResponse: ImageGeneratorLlmJsonResponse): string {

	if (jsonResponse.prompt.length < 1)
		throw new Error(`The prompt field is empty.`)
	if (jsonResponse.prompt_summary.length < 1)
		throw new Error(`The prompt summary field is empty.`)

	// Build the dual encoder prompt by putting the shorter
	//  of the prompt and prompt summary fields first, and the
	//  other second, separated by a pipe "|" character.
	let dualPrompt = null;

	if (jsonResponse.prompt.length < jsonResponse.prompt_summary.length) {
		dualPrompt =
			`${jsonResponse.prompt} | ${jsonResponse.prompt_summary}`;
	} else {
		dualPrompt =
			`${jsonResponse.prompt_summary} | ${jsonResponse.prompt}`;
	}

	return dualPrompt;
}

/**
 * This function processes one chat volley for the
 *  Livepeer image assistant
 *
 * @param client - The client WebSocket connection we are
 *  servicing.  Pass NULL if this call is being made from
 *  a test harness.
 * @param initialState - The initial state of the session
 *  at the top of this call, before we (may) alter it
 * @param userId_in - The ID of the current user.
 * @param userInput_in - The latest input from that user.
 * @param image_processing_mode - The type of image
 *  processing we should execute.
 * @param urlToActiveImageInClient - If we are in a
 *  auto image refinement session, then this parameter
 *  will contain the URL to the image the user has
 *  selected in the client, since that is the one we
 *  are refining.  Otherwise, the value will be ignored.
 *
 * @return - Returns the array of images generated if
 *  successful, throws an error if not.
 */
export async function processImageChatVolley(
	client: WebSocket | null,
	initialState: StateType,
	userId_in: string,
	userInput_in: string,
	image_processing_mode: string,
	urlToActiveImageInClient: string): Promise<string[]> {

	const FILE_REFINEMENT_LOG: string = "refinement.log";
	let refinementLogMsg = '(none)';

	let textCompletionForMainImgGenPrompt = null;
	let fullImageGenSystemPrompt: StringOrNull = null;
	let fullImageGenUserPrompt: StringOrNull = null;

	if (fs.existsSync(FILE_REFINEMENT_LOG)) {
		// Delete the log file each iteration.
		fs.unlinkSync(FILE_REFINEMENT_LOG);
	}

	// Add a long refinement session log message to that log file.
	function debugRefinementLog(refinementLogMsg: string, bPrintSeparator=false) {
		if (bPrintSeparator)
			writeTextFile(FILE_REFINEMENT_LOG, '\n -----------------------=======----------------------- \n');

		writeTextFile(FILE_REFINEMENT_LOG, '\n' + refinementLogMsg + '\n');
	}

	// -------------------- BEGIN: REMOVE THIS AD HOC TEST ------------

	// await testSambaNova(
	//	'https://api.sambanova.ai/v1/chat/completions',
	//	process.env.SAMBANOVA_API_KEY as string);

	// -------------------- END  : REMOVE THIS AD HOC TEST ------------

	// Simple function to send a state message when just
	//  a text notification to the client is needed.
	const sendStateMessageSimplified = (newStateMessage: string) => {
		const newState = initialState;

		if (client) {
			newState.state_change_message = newStateMessage;
			sendStateMessage(client, newState);
		}
	}

	const userId = userId_in.trim()

	if (userId.length < 1)
		throw new Error(`The user ID is empty or invalid.`);

	let userInput = userInput_in.trim();

	if (userInput.length < 1)
		throw new Error(`The user input is empty or invalid.`);

	// We need a starting chat state. If we have a
	//  chat history for the user, load it and use
	//  the last (most recent) chat volley object's
	//  ending state.  If not, create a default
	//  chat state object.
	const  chatHistoryObj =
		await readChatHistory(userId, EnumChatbotNames.IMAGE_ASSISTANT);

	const chatVolley_previous =
		chatHistoryObj.getLastVolley()

	const previousChatVolleyPrompt =
		chatVolley_previous?.prompt;

	const chatState_start =
		// chatVolley_previous?.chat_state_at_start_image_assistant ??
		chatVolley_previous?.chat_state_at_end_image_assistant ?? CurrentChatState_image_assistant.createDefaultObject();

	// Make a clone of the starting chat state so that we can
	//  have it as a reference as we make state changes.
	const chatState_current =
		chatState_start.clone();

	// Get the most recent base level image description.
	//  If we don't have one yet, then just use the
	//  user input for this.
	let baseLevelImageDescPromptPair: BaseLevelImageDescriptionPromptPair = {
		prompt: userInput,
		negative_prompt: ''
	};

	if (image_processing_mode !== EnumImageProcessingModes.NEW) {
		// This is not a new image request but a refine
		//  or an enhancement request.  Get the most
		//  recent base level image prompt, falling back
		//  to the user input if none could be found.
		const lastBaseLevelImageDescPromptPair =
			chatHistoryObj.getLastBaseLevelImagePrompt();

		if (lastBaseLevelImageDescPromptPair) {
			baseLevelImageDescPromptPair = {
				prompt: lastBaseLevelImageDescPromptPair.prompt,
				negative_prompt: lastBaseLevelImageDescPromptPair.negative_prompt
			}

			// Don't double-add the user input if the user just
			//  hit the REFINE button without any giving any
			//  modification instructions for feedback, since
			//  that will duplicate the last base level prompt
			//  text.
			if (userInput !== lastBaseLevelImageDescPromptPair.prompt)
				// Add the modification instruction or the feedback
				//  to the base level image description so it gets
				//  into the refinement pipeline for further
				//  LLM text completions.
				baseLevelImageDescPromptPair.prompt =
					// Make sure there is an intervening end of sentenced
					//  character.
					appendEosCharIfNotPresent(baseLevelImageDescPromptPair.prompt) + ' ' + userInput;

			refinementLogMsg = `(top) lastBaseLevelImageDescPromptPair:\n\nPROMPT: ${baseLevelImageDescPromptPair.prompt}\nNEGATIVE_PROMPT: ${baseLevelImageDescPromptPair.negative_prompt}`;
			debugRefinementLog(refinementLogMsg);
		}
	}


	// If the auto image refinement session flag is set, we do that
	//  processing here.
	let finalRefinementResultObj = null;

	// All the image processing modes other than the new image
	//  mode must have an active image URL.
	if (image_processing_mode === EnumImageProcessingModes.NEW) {
		// -------------------- BEGIN: NEW IMAGE REQUEST (Explicit) ------------

		// User input was entered manually.  Reset the CONTIGUOUS refinement
		//  count variable.
		chatState_current.refinement_iteration_count = 0;

		refinementLogMsg = `Reset CONTIGUOUS refinement iteration count to zero, due to manual user input.  Current value: ${chatState_current.refinement_iteration_count}.`;
		console.info(CONSOLE_CATEGORY, refinementLogMsg);
		debugRefinementLog(refinementLogMsg);

		// -------------------- END  : NEW IMAGE REQUEST (Explicit) ------------
	} else {
		//  Not a new image request.  We must have a valid image URL.
		if (urlToActiveImageInClient.length < 1)
			throw new Error(`The image processing mode is set to "${image_processing_mode}" so the URL to the active image in the client must not be empty.`);

		// Increment the CONTIGUOUS refinement count variable.
		chatState_current.refinement_iteration_count++;

		refinementLogMsg = `Incremented the CONTIGUOUS refinement iteration count while in processing mode("${image_processing_mode}").  Current value: ${chatState_current.refinement_iteration_count}.`;
		console.info(CONSOLE_CATEGORY, refinementLogMsg);
		debugRefinementLog(refinementLogMsg);

		// If the current image process mode is "refine", do
		//  the refinment processing now.
		if (image_processing_mode === EnumImageProcessingModes.REFINE) {
			// -------------------- BEGIN: IMAGE REFINE ------------

			if (baseLevelImageDescPromptPair === null)
				throw new Error(`The base level image description prompt pair is unassigned.`)

			finalRefinementResultObj =
				await doRefinement_2(
					userId,
					userInput,
					baseLevelImageDescPromptPair.prompt,
					urlToActiveImageInClient,
					chatHistoryObj,
					debugRefinementLog
				);

			// -------------------- END  : IMAGE REFINE ------------
		}
	}

	// -------------------- BEGIN: INTENT DETECTOR PRE-STEP ------------

	const bDoIntents = true;

	// This array will accumulate the text we should
	//  add to the response to the user, that describe
	//  what changes we made to the chat session state.
	const aryChangeDescriptions = [];

	// The array of intent detector JSON response objects
	//  will be put here.
	const aryIntentDetectorJsonResponseObjs: IntentJsonResponseObject[] = [];

	let bIsStartNewImage = false;
	let wrongContentText: string | null = null

	if (bDoIntents) {
		// >>>>> Status message: Tell the client we are thinking as
		//  we make the intent detector calls.
		if (client) {
			let newState = initialState

			// We haven't started the image request yet but
			//  overall, we are indeed waiting for images.
			newState.waiting_for_images = true
			newState.state_change_message = 'Thinking...'

			sendStateMessage(client, newState)
		}

		// -------------------- BEGIN: CHAT HISTORY FOR INTENTS ------------

		const bDoGiveChatHistoryToIntents = false;

		let userInputForIntents = userInput;

		if (bDoGiveChatHistoryToIntents) {
			const chatHistoryLastImagePrompt =
				chatHistoryObj.buildChatHistoryLastImageOnly(userInput);

			if (chatHistoryLastImagePrompt) {
				// Replace the user input with the annotated
				//  user input that contains the chat history
				//  for the last image
				userInputForIntents = chatHistoryLastImagePrompt;
			}
		}

		// -------------------- BEGIN: SWITCH, userInputForIntents OR suggestedUserFeedback ------------

		if (image_processing_mode === EnumImageProcessingModes.REFINE && finalRefinementResultObj !== null) {
			userInputForIntents = finalRefinementResultObj.suggestedUserFeedback;
		}

		// -------------------- END  : SWITCH, userInputForIntents OR suggestedUserFeedback ------------

		// -------------------- END  : CHAT HISTORY FOR INTENTS ------------

		// Run the user input by all intents.
		console.info(CONSOLE_CATEGORY, `Doing intents through SambaNova...`)

		const aryIntentDetectResultObjs =
			await processAllIntents(
				Object.values(enumIntentDetectorId_image_assistant),
				g_TextCompletionParamsForIntentDetector,
				userInputForIntents);

		// Dump the user input to the console.
		console.info(CONSOLE_CATEGORY, `userInput:\n\n\n${userInput}\n\n`)
		console.info(CONSOLE_CATEGORY, `userInputForIntents:\n\n\n${userInputForIntents}\n\n`)

		// Dump the results to the console.
		showIntentResultObjects(aryIntentDetectResultObjs);

		// If any of the results errored out, for now, we throw
		//  an error.
		//
		// TODO: Add recovery or mitigation code instead.
		if (aryIntentDetectResultObjs.some(
			(intentResultObj) =>
				intentResultObj.is_error === true
		)) {
			throw new Error(`$One or more of the intent detector calls failed.`)
		}

		// Create an array of the intent detector JSON response
		//  objects.
		console.info(CONSOLE_CATEGORY, `Creating an array of intent detector JSON responses objects.`)

		aryIntentDetectResultObjs.forEach(
			(intentResultObj) => {
				// Merge the intent detector ID into the
				//  JSON response object.
				const jsonResponseObj = {
					intent_detector_id:  intentResultObj.result_or_error.intent_detector_id,
					array_child_objects: intentResultObj.result_or_error.json_response
				}

				aryIntentDetectorJsonResponseObjs.push(jsonResponseObj)
			}
		)

		if (aryIntentDetectorJsonResponseObjs.length < 1)
			throw new Error(`The array of intent detectors JSON response objects is empty.`);

		// -------------------- BEGIN: INTENT DETECTIONS TO STATE CHANGES ------------

		// Now we examine the JSON response objects received from
		//  the intent detections to see if we should make any
		//  state changes.

		// >>>>> Explicit start new image request?
		const bIsStartNewImageDetected_explicit =
			getBooleanIntentDetectionValue(
				aryIntentDetectorJsonResponseObjs,
				enumIntentDetectorId_image_assistant.START_NEW_IMAGE,
				'start_new_image'
			);

		// >>>>> Implicit start new image request?
		const natureOfUserRequest =
			getStringIntentDetectionValue(
				aryIntentDetectorJsonResponseObjs,
				enumIntentDetectorId_image_assistant.NATURE_OF_USER_REQUEST,
				'nature_of_user_request',
				null
			);

		let bIsStartNewImageDetected_implicit = false;

		if (natureOfUserRequest) {
			bIsStartNewImageDetected_implicit =
				natureOfUserRequest === 'create_new_image_request';
		}


		// Is the image processing mode for a new image, or
		//  did the user express either an explicit or implicit
		//  request to start a new image
		//  detected?
		if (image_processing_mode === EnumImageProcessingModes.NEW
			|| bIsStartNewImageDetected_explicit
			|| bIsStartNewImageDetected_implicit) {
			// Yes.  Set the start new image flag.
			bIsStartNewImage = true;

			// Reset image generation parameters
			//  to the defaults.
			chatState_current.guidance_scale = DEFAULT_GUIDANCE_SCALE
			chatState_current.steps = DEFAULT_NUMBER_OF_IMAGE_GENERATION_STEPS
			chatState_current.model_id = DEFAULT_IMAGE_GENERATION_MODEL_ID
			chatState_current.loras = {}

			refinementLogMsg = `Image generation parameters reset to the defaults, due to a start new image request.`;
			console.info(CONSOLE_CATEGORY, refinementLogMsg);
			debugRefinementLog(refinementLogMsg);
		}

		// Notify the client on the nature of the current
		//  user request.
		if (bIsStartNewImage)
			sendStateMessageSimplified('New image request detected...');
		else
			sendStateMessageSimplified('Modifying existing image...');

		// -------------------- BEGIN: EXTENDED WRONG CONTENT DETECTOR ------------

		// We do not execute the extended wrong content
		//  detector if the user input was classified as
		//  a new image request.
		if (bIsStartNewImage) {
			console.info(CONSOLE_CATEGORY, `New image request.  Ignoring extended wrong content detector.`);
		} else {
			// The extended wrong content detector is handled separately
			//  because we need to push text into the prompt for it.

			// Prepare the EXTENDED wrong content prompt.
			const previousImageGenPrompt =
				previousChatVolleyPrompt ?? '';

			//  const evalStrExtendedWrongContent = '`' + g_ExtendedWrongContentPrompt + '`';

			const evaluatedExtendedWrongContent =
				// eval(evalStrExtendedWrongContent);
				substituteWithoutEval(g_ExtendedWrongContentPrompt, (varName) => eval(varName));

			// Make a separate completion call for it.
			console.info(CONSOLE_CATEGORY, `>>>>> Making extended wrong content detector completion request <<<<<`)

			const textCompletion =
				await sambaNovaChatCompletionImmediate(
					'EXTENDED-WRONG-CONTENT-PROMPT',
					evaluatedExtendedWrongContent,
					userInputForIntents,
					g_TextCompletionParams,
					true,
					null);

			if (textCompletion.is_error)
				throw new Error(`The extended wrong content detector completion call failed with error: ${textCompletion.error_message}`);

			const extWrongContentJsonResponseObj: IntentJsonResponseObject =
				{
					intent_detector_id: enumIntentDetectorId_image_assistant.USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT,
					array_child_objects: textCompletion.json_response as object[]
				}

			// Add it to the array of intent detection JSON response objects.
			aryIntentDetectorJsonResponseObjs.push(extWrongContentJsonResponseObj);
		}

		// -------------------- END  : EXTENDED WRONG CONTENT DETECTOR ------------

		// >>>>> Text on image wanted?
		const bIsTextOnImageDesired =
			getBooleanIntentDetectionValue(
				aryIntentDetectorJsonResponseObjs,
				enumIntentDetectorId_image_assistant.IS_TEXT_WANTED_ON_IMAGE,
				'is_text_wanted_on_image'
			);

		if (bIsTextOnImageDesired) {
			// Switch to the FLUX model since it is
			//  much better for text on images.
			chatState_current.model_id =
				enumImageGenerationModelId.FLUX

			// Make sure the number of step is high.
			if (chatState_current.steps < MIN_STEPS_FOR_IMAGE_ON_TEXT_OR_WRONG_CONTENT_COMPLAINT)
				chatState_current.steps = MIN_STEPS_FOR_IMAGE_ON_TEXT_OR_WRONG_CONTENT_COMPLAINT

			aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_USE_TEXT_ENGINE)
			aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_MORE_STEPS)

			// Make sure we are using the minimum guidance scale too
			//  for text on images.
			if (chatState_current.guidance_scale < MIN_GUIDANCE_SCALE_IMAGE_TEXT_OR_WRONG_COMPLAINT_VALUE) {
				chatState_current.guidance_scale = MIN_GUIDANCE_SCALE_IMAGE_TEXT_OR_WRONG_COMPLAINT_VALUE;

				refinementLogMsg = `Guidance scale set to the minimum guidance scale value for images with text.`;
				console.info(CONSOLE_CATEGORY, refinementLogMsg);
				debugRefinementLog(refinementLogMsg);

				aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_BE_LESS_CREATIVE);
			}
		} else {
			// We don't switch away from flux to
			//  another model just because the
			//  user did not indicate they want
			//  text on images this volley.  This
			//  may be a continuation of a current
			//  text on image generation session.
		}

		// >>>>> Blurry image or lack of detail?
		const bIsImageBlurry =
			isStringIntentDetectedWithMatchingValue(
				aryIntentDetectorJsonResponseObjs,
				enumIntentDetectorId_image_assistant.USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT,
				'complaint_type',
				'blurry'
			);

		if (bIsImageBlurry) {
			// TODO: There should be an upper limit here.

			// Increase the number of steps used.
			chatState_current.steps += NUM_STEPS_ADJUSTMENT_VALUE;

			aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_MORE_STEPS)
		}

		// >>>>> Image generation too slow?
		const bIsImageGenerationTooSlow =
			isStringIntentDetectedWithMatchingValue(
				aryIntentDetectorJsonResponseObjs,
				enumIntentDetectorId_image_assistant.USER_COMPLAINT_IMAGE_GENERATION_SPEED,
				'complaint_type',
				'generate_image_too_slow'
			);

		// TODO: Disabled this check for now since it is
		//  being triggered incessantly.
		if (bIsImageGenerationTooSlow  && false) {
			// Decrease the number of steps used.
			chatState_current.steps -= NUM_STEPS_ADJUSTMENT_VALUE

			if (chatState_current.steps < MIN_STEPS)
				chatState_current.steps = MIN_STEPS;

			aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_LESS_STEPS)
		}

		// -------------------- BEGIN: VARIATION UP/DOWN TRIAGE ------------

		// If the user reports wrong content at the same time the
		//  want more variation, the two opposing adjustments to
		//  guidance_scale will conflict.  Therefore, we check for
		//  those two intent detections together, before taking
		//  action on them.

		// >>>>> Check for the user wanting less variation, usually
		//  via a "wrong_content" complaint.
		const bIsWrongContent =
			isStringIntentDetectedWithMatchingValue(
				aryIntentDetectorJsonResponseObjs,
				enumIntentDetectorId_image_assistant.USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT,
				'complaint_type',
				'wrong_content',
			);

		// Check for extended wrong content detection.

		// If there is a wrong content complaint, get the text that
		//  was identified as the problem item.
		if (bIsWrongContent) {
			wrongContentText =
				getStringIntentDetectionValue(
					aryIntentDetectorJsonResponseObjs,
					enumIntentDetectorId_image_assistant.USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT,
					'complaint_type',
					'complaint_text'
				) as string

			if (wrongContentText && wrongContentText.length > 0)
				aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_FIX_WRONG_CONTENT)

			// We don't want to double increase the steps if
			//  the text on image flag is set.
			if (!bIsTextOnImageDesired) {
				// Switch to the FLUX model since it is
				//  much better for text on images.
				chatState_current.model_id =
					enumImageGenerationModelId.FLUX

				aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_USE_FLUX_ENGINE)

				// Make sure the number of step is high.
				if (chatState_current.steps < MIN_STEPS_FOR_IMAGE_ON_TEXT_OR_WRONG_CONTENT_COMPLAINT) {
					chatState_current.steps = MIN_STEPS_FOR_IMAGE_ON_TEXT_OR_WRONG_CONTENT_COMPLAINT

					aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_MORE_STEPS)

					// Make sure we are using the minimum guidance scale too
					//  for fixing wrong content complaints.
					if (chatState_current.guidance_scale < MIN_GUIDANCE_SCALE_IMAGE_TEXT_OR_WRONG_COMPLAINT_VALUE) {
						chatState_current.guidance_scale = MIN_GUIDANCE_SCALE_IMAGE_TEXT_OR_WRONG_COMPLAINT_VALUE;

						refinementLogMsg = `Guidance scale set to the minimum guidance scale value for an image with text on it, while inside the block that handles wrong content complaints.`;
						console.info(CONSOLE_CATEGORY, refinementLogMsg);
						debugRefinementLog(refinementLogMsg);

						aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_BE_LESS_CREATIVE)
					}
				}
			}
		}

		// >>>>> Check for misspelled letters.
		const bIsMisspelled =
			isStringIntentDetectedWithMatchingValue(
				aryIntentDetectorJsonResponseObjs,
				enumIntentDetectorId_image_assistant.USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT,
				'complaint_type',
				'problems_with_text'
			);


		// >>>>> Check for the user wanting more variation
		let bIsImageBoring =
			isStringIntentDetectedWithMatchingValue(
				aryIntentDetectorJsonResponseObjs,
				enumIntentDetectorId_image_assistant.USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT,
				'complaint_type',
				'boring'
			);

		// If this is a new image request, then we assume
		//  that the "boring" complaint is a false positive.
		if (bIsImageBoring && image_processing_mode === EnumImageProcessingModes.NEW) {
			bIsImageBoring = false;

			refinementLogMsg = `Flipped bIsImageBoring flag to FALSE because this is a NEW image request.`;
			console.info(CONSOLE_CATEGORY, refinementLogMsg);
			debugRefinementLog(refinementLogMsg);
		}

		// We favor the wrong content or misspelled complaint over the image is
		//  boring complaint.
		if (bIsWrongContent || bIsMisspelled) {
			// TODO: There should be an upper limit here.
			// Increase the number of steps used but by three times as much as normal.
			chatState_current.steps += 3 * NUM_STEPS_ADJUSTMENT_VALUE

			aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_A_LOT_MORE_STEPS)

			// Increase the guidance value.  Note, the log message
			//  for this change is down below, with a specific
			//  log message that fits the context of the correct
			//  code block.
			const orgGuidanceScale = chatState_current.guidance_scale;
			chatState_current.guidance_scale += NUM_GUIDANCE_SCALE_ADJUSTMENT_VALUE

			refinementLogMsg = `Guidance scale INCREASED from(${orgGuidanceScale}) to: ${chatState_current.guidance_scale}.`;
			console.info(CONSOLE_CATEGORY, refinementLogMsg);
			debugRefinementLog(refinementLogMsg);

			// Decrease the LLM temperature so it gets
			//  less creative with the prompt.
			chatState_current.temperature -=
				NUM_TEMPERATURE_ADJUSTMENT_VALUE;

			refinementLogMsg = `Temperature DECREASED due a complaint by the user that the image content is WRONG.`;
			console.info(CONSOLE_CATEGORY, refinementLogMsg);
			debugRefinementLog(refinementLogMsg);

			aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_BE_LESS_CREATIVE)

			// Misspellings are the worst offense.
			if (bIsMisspelled) {
				// Make absolutely sure we are using Flux!
				if (chatState_current.model_id !== enumImageGenerationModelId.FLUX) {
					chatState_current.model_id = enumImageGenerationModelId.FLUX

					aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_USE_TEXT_ENGINE)
				}

				refinementLogMsg = `Guidance scale INCREASED due a MISSPELLING complaint.`;
				console.info(CONSOLE_CATEGORY, refinementLogMsg);
				debugRefinementLog(refinementLogMsg);
			} else if (bIsWrongContent) {
				aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_BE_LESS_CREATIVE)

				refinementLogMsg = `Guidance scale INCREASED due a WRONG CONTENT complaint.`;
				console.info(CONSOLE_CATEGORY, refinementLogMsg);
				debugRefinementLog(refinementLogMsg);
			}

			// If we also have a boring image complaint, modify the change
			//  description to tell the user that we will concentrate on
			//  getting the image content correct first.
			if (bIsImageBoring)
				aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_BE_CREATIVE_LATER)
		} else if (bIsImageBoring) {
			// Decrease the guidance value.
			chatState_current.guidance_scale -= NUM_GUIDANCE_SCALE_ADJUSTMENT_VALUE

			// Increase the LLM temperature so it gets
			//  more creative with the prompt.
			chatState_current.temperature +=
				NUM_TEMPERATURE_ADJUSTMENT_VALUE;

			if (chatState_current.steps < MIN_STEPS)
				chatState_current.steps = MIN_STEPS;

			aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_BE_MORE_CREATIVE)

			refinementLogMsg = `Guidance scale DECREASED due a complaint by the user that the image is BORING.`;
			console.info(CONSOLE_CATEGORY, refinementLogMsg);
			debugRefinementLog(refinementLogMsg);

			refinementLogMsg = `Temperature INCREASED due a complaint by the user that the image is BORING.`;
			console.info(CONSOLE_CATEGORY, refinementLogMsg);
			debugRefinementLog(refinementLogMsg);
		}

		// -------------------- END  : VARIATION UP/DOWN TRIAGE ------------

		// -------------------- END  : INTENT DETECTIONS TO STATE CHANGES ------------
	}

	// -------------------- END  : INTENT DETECTOR PRE-STEP ------------

	// -------------------- BEGIN: MAIN IMAGE GENERATOR PROMPT STEP ------------

	console.info(CONSOLE_CATEGORY, `----------------------- MAIN LLM INTERACTION ---------------\n\n`);

	let revisedImageGenPrompt = null;
	let revisedImageGenNegativePrompt = null;

	// Override the image generation text completion
	//  parameters temperature value with the current
	//  one for the session.  Clip the temperature to
	//  between 0.2 and 1.0.
	chatState_current.temperature =
		Math.max(0.4, Math.min(chatState_current.temperature, 1.0));

	// For the new image or refine image modes, we decompose
	//  the user input into its base scene element assertions.
	//  This is we prefer accuracy over embellishment in these
	//  two modes.
	if (image_processing_mode === EnumImageProcessingModes.NEW || image_processing_mode === EnumImageProcessingModes.REFINE) {

		// -------------------- BEGIN: DECOMPOSE USER INPUT ------------

		// We always decompose the user's original image description
		//  into the fundamental scene logic elements, in order to
		//  increase the accuracy of the generated image.
		const fullDecomposeSceneLogicPrompt =
			substituteWithoutEval(g_DecomposeSentenceLogicPrompt, (varName) => eval(varName));

		refinementLogMsg = `fullDecomposeSceneLogicPrompt:\n\n${fullDecomposeSceneLogicPrompt}`;
		debugRefinementLog(refinementLogMsg, true);
		// aryRefinementLogMsgs.push(refinementLogMsg);

		const decomposeSentenceLogicParams =
			new SambaNovaParams_text_completion({ temperature_param_val: 0.3 });

		textCompletionForMainImgGenPrompt =
			await sambaNovaChatCompletionImmediate(
				'DECOMPOSE-SENTENCE-LOGIC',
				fullDecomposeSceneLogicPrompt,
				baseLevelImageDescPromptPair.prompt,
				decomposeSentenceLogicParams,
				false,
				null);

		if (textCompletionForMainImgGenPrompt.is_error)
			throw new Error(`The call to decompose the user input into fundamental scene elements failed with error: ${textCompletionForMainImgGenPrompt.error_message}`);

		const decomposedSentenceLogic =
			textCompletionForMainImgGenPrompt.text_response;

		refinementLogMsg = `decomposedSentenceLogic:\n\n${decomposedSentenceLogic}`;
		debugRefinementLog(refinementLogMsg, true);
		// aryRefinementLogMsgs.push(refinementLogMsg);

		refinementLogMsg = `Replaced user input with decomposed user input.`;
		debugRefinementLog(refinementLogMsg);

		revisedImageGenPrompt = decomposedSentenceLogic;

		// If this is a REFINE operation, we use the negative
		//  prompts returned by the refinement text completion
		//  response.
		if (image_processing_mode === EnumImageProcessingModes.REFINE && finalRefinementResultObj) {
			revisedImageGenNegativePrompt = finalRefinementResultObj.finalRefinementNegativePrompt;
		} else {
			// NEW image operation.  Use the most recent basel level
			//  image description NEGATIVE prompt, if one exists.
			revisedImageGenNegativePrompt = baseLevelImageDescPromptPair.negative_prompt ?? '';
		}

		fullImageGenSystemPrompt = decomposedSentenceLogic;
		fullImageGenUserPrompt = 'Please create an image like this.';

		// -------------------- END  : DECOMPOSE USER INPUT ------------
	} else if (image_processing_mode === EnumImageProcessingModes.ENHANCE) {
		// -------------------- BEGIN: ENHANCE IMAGE ------------

		// Now we need to get help from the LLM on creating or refining
		//  a good prompt for the user.
		const userAndSystemPromptObj =
			buildChatBotSystemPrompt_image_assistant(
				userInput,
				wrongContentText,
				chatHistoryObj,
				bIsStartNewImage);

		console.info(CONSOLE_CATEGORY, `>>>>> Making main LLM text completion request <<<<<`);

		const useTextCompletionParams: SambaNovaParams_text_completion = {
			...g_TextCompletionParamsImageGeneration,
			temperature_param_val: chatState_current.temperature,
		};

		textCompletionForMainImgGenPrompt =
			await sambaNovaChatCompletionImmediate(
				'MAIN-IMAGE-GENERATION-PROMPT',
				userAndSystemPromptObj.systemPrompt,
				userAndSystemPromptObj.userPrompt,
				useTextCompletionParams,
				true,
				g_AryPropertyDetails_main_image_gen_prompt);

		if (textCompletionForMainImgGenPrompt.is_error) {
			throw new Error(`Error during main image generation text completion for image processing mode("${image_processing_mode}"):\n\n${textCompletionForMainImgGenPrompt.error_message}`);
		}

		// Type assertion to include 'revised_image_prompt'
		const jsonResponse = textCompletionForMainImgGenPrompt.json_response as ImageGeneratorLlmJsonResponse;

		revisedImageGenPrompt =
			buildDualEncoderPrompt(jsonResponse);

		if (revisedImageGenPrompt === null ||
			(typeof revisedImageGenPrompt === 'string' && revisedImageGenPrompt.length < 1))
			throw new Error(`The revised image generation prompt is invalid or empty.`);

		// The negative prompt may be empty.
		revisedImageGenNegativePrompt =
			jsonResponse.negative_prompt ?? '';

		fullImageGenSystemPrompt = userAndSystemPromptObj.systemPrompt;
		fullImageGenUserPrompt = userAndSystemPromptObj.userPrompt;

		// We do pass on the negative prompt elements from
		//  the last refinement iteration.
		revisedImageGenNegativePrompt = baseLevelImageDescPromptPair.negative_prompt ?? '';

		// -------------------- END  : ENHANCE IMAGE ------------
	} else {
		throw new Error(`Unknown image processing mode: ${image_processing_mode}.`)
	}

	// We must have a valid revise image generation prompt
	//  at this point.
	if (revisedImageGenPrompt === null)
		throw new Error(`The revised image generation prompt is empty or invalid..`)

	// -------------------- END  : MAIN IMAGE GENERATOR PROMPT STEP ------------

	// -------------------- BEGIN: MODEL PARAMETERS FINAL ADJUSTMENTS ------------

	// Too much guidance scale for photorealistic images
	//  makes it harder to generate them.
	//
	// TODO: This is kludgy.  Add an intent detector
	//  that looks for user expressions indicating a
	//  a desire for a realistic image.
	let bIsPhotoRealismDesired = false;
	const regex = /\breal\b|realism|realistic/i;

	if (regex.test(revisedImageGenPrompt)) {
		bIsPhotoRealismDesired = true;
	}

	// Limit guidance scale from getting too high or the model
	//  can easily start leaving out elements in the prompt
	//  that are underrepresented in the latent space.
	if (bIsPhotoRealismDesired) {
		if (chatState_current.guidance_scale > MAX_GUIDANCE_SCALE_PHOTOREALISTIC) {
			chatState_current.guidance_scale = MAX_GUIDANCE_SCALE_PHOTOREALISTIC;

			refinementLogMsg = `Clipped PHOTOREALISTIC guidance scale to : ${chatState_current.guidance_scale}`;
			console.info(CONSOLE_CATEGORY, refinementLogMsg);
			debugRefinementLog(refinementLogMsg);
		}
	} else {
		if (chatState_current.guidance_scale > MAX_GUIDANCE_SCALE) {
			chatState_current.guidance_scale = MAX_GUIDANCE_SCALE;

			refinementLogMsg = `Clipped guidance scale to : ${chatState_current.guidance_scale}`;
			console.info(CONSOLE_CATEGORY, refinementLogMsg);
			debugRefinementLog(refinementLogMsg);
		}
	}

	// Limit guidance scale from getting too high or the model
	//  can easily start leaving out elements in the prompt
	//  that are underrepresented in the latent space.
	if (chatState_current.steps > MAX_STEPS) {
		chatState_current.steps = MAX_STEPS;

		refinementLogMsg = `Clipped steps to : ${chatState_current.steps}`;
		console.info(CONSOLE_CATEGORY, refinementLogMsg);
		debugRefinementLog(refinementLogMsg);
	}

	// -------------------- END  : MODEL PARAMETERS FINAL ADJUSTMENTS ------------

	// -------------------- BEGIN: CREATE RESPONSE FOR USER ------------

	// We build a response to be shown to the user by the
	//  client using what we have so far.
	// Build the response we send to the user.  We show
	//  them the prompt the LLM gave us that we sent
	//  to the image generation model, and the
	//  text we assembled to tell the user what we
	//  did in response to feedback they gave us
	//  about the last image generation.
	let responseSentToClient =
		// If we are in an auto image refinement, then show
		//  the machine generated suggested user feedback.
		(image_processing_mode === EnumImageProcessingModes.REFINE)
			? `SUGGESTED USER FEEDBACK:\n\n${finalRefinementResultObj?.suggestedUserFeedback}\n\n`
			: '';

	responseSentToClient +=
		`Here is the new or revised image generation request we just made:\n\n"${revisedImageGenPrompt}"\n`;

	responseSentToClient +=
		`\nAnd the accompanying NEGATIVE prompts (if any):\n\n"${revisedImageGenNegativePrompt}"\n`;

	if (aryChangeDescriptions.length > 0) {
		const uniqueChangeDescriptions = [...new Set(aryChangeDescriptions)];

		responseSentToClient +=
			`\nand the changes I made to improve the result:\n\n\n${uniqueChangeDescriptions.join('\n')}\n`;
	}

	responseSentToClient += `\nLet's see how this one turns out.`

	if (bVerbose_process_chat_volley) {
		// Show the current stable diffusion parameters.
		const strStableDiffusionParams = chatState_current.toStringStableDiffusionParameters();

		responseSentToClient +=
			`\n\nCURRENT LLM TEMPERATURE: ${chatState_current.temperature}\n\n CURRENT STABLE DIFFUSION PARAMETERS:\n\n{\n${strStableDiffusionParams}\n}\n`;
	}

	// Now send the response message to the client while we make
	//  the image generation request.
	//
	// >>>>> Status message: Tell the client we have made the
	//  image request
	if (client) {
		let newState = initialState

		// Make sure the "waiting for images" state is set
		newState.waiting_for_images = false
		newState.state_change_message = 'Requesting image, may take a minute or so...'

		sendStateMessage(
			client,
			newState
		)

		sendTextMessage(
			client,
			{
				delta: responseSentToClient
			}
		)
	}

	// -------------------- END  : CREATE RESPONSE FOR USER ------------

	// -------------------- BEGIN: UPDATE CHAT HISTORY ------------

	if (fullImageGenSystemPrompt === null || fullImageGenSystemPrompt.length < 1)
		throw new Error(`Invalid or empty full system prompt..`)

	const newChatVolleyObj =
		new ChatVolley(
			bIsStartNewImage,
			null,
			userInput,
			revisedImageGenPrompt,
			revisedImageGenNegativePrompt,
			textCompletionForMainImgGenPrompt,
			responseSentToClient,
			chatState_start,
			chatState_current,
			null,
			null,
			aryIntentDetectorJsonResponseObjs,
			fullImageGenSystemPrompt,
			fullImageGenUserPrompt,
			image_processing_mode,
			// We pass in an empty array of image URLs now
			//  so that we can get the current information
			//  to the client, without having to wait for
			//  the images to be generated.
			[]
		);

	chatHistoryObj.addChatVolley(newChatVolleyObj);

	// Update storage.
	writeChatHistory(userId, chatHistoryObj, EnumChatbotNames.IMAGE_ASSISTANT)

	// -------------------- END  : UPDATE CHAT HISTORY ------------

	// -------------------- BEGIN: MAKE IMAGE REQUEST ------------

	// Is the model locked?
	if (bIsStableDiffusionModelLocked) {
		// Override the model ID to use the faster
		//  default model.
		chatState_current.model_id = DEFAULT_IMAGE_GENERATION_MODEL_ID;

		sendStateMessageSimplified('MODEL LOCKED TO FASTER GENERATION MODEL!')
	}

	if (image_processing_mode === EnumImageProcessingModes.REFINE) {
		// Image refinement mode.  Make sure we have valid
		//  finalRefinementPrompt and suggestedUserFeedback
		//  values.
		if (finalRefinementResultObj === null
			|| finalRefinementResultObj.finalRefinementPrompt.length < 1
			|| finalRefinementResultObj.suggestedUserFeedback.length < 1)
			throw new Error(`Auto image refinement flag set but the refinement result object is invalid.`);
	}

	const aryImageUrls_png =
		// https://dream-gateway.livepeer.cloud/text-to-image
		await generateImages_chat_bot(
			revisedImageGenPrompt,
			revisedImageGenNegativePrompt,
			chatState_current,
			sendStateMessageSimplified,
			3)

	// -------------------- END  : MAKE IMAGE REQUEST ------------

	// -------------------- BEGIN: CONVERT TO JPG IF NECESSARY ------------

	// For now, we always convert the PNG files Livepeer generates
	//  to JPG files and automatically store them to S3.  This is
	//  so we can recreate a session and analyze manually the
	//  flow and success/failure of our code to improve the
	//  image.
	const aryS3ImageUrls_jpg: string[] = [];
	const aryImagePackages: ImagePackage[] = [];

	// for (let i = 0; i < aryImageUrls_png.length; i++) {

	// TODO: For some odd reason we "seem" to be getting
	//  two copies of the exact same image URL, but only
	//  on the server.  For now, we just limit the loop
	//  to one image.
	console.warn(`LIMITING image loop to ONE image!.`);

	for (let i = 0; i < 1; i++) {
		// NOTE: TODO: The superfluous creation of image package
		//  objects in this loop may seem odd because in an older
		//  iteration this is where we created the image packages
		//  for an auto image refinement session.  That resulted
		//  in awkward flow so now that processing is done at
		//  the top of the volley, so the image package part
		//  of this code is vestigial at the moment.

		// Save it to S3.
		console.log(`[Img # ${i}] Calling putLivepeerImageToS3AsJpgExt() with PNG image URL:\n${aryImageUrls_png[i]}`);
		const imagePackage =
			await putLivepeerImageToS3AsJpgExt(userId, aryImageUrls_png[i]);

		// We should never get a NULL image buffer object, since that
		//  means the generated image already existed.
		if (!imagePackage.imageBuffer)
			throw new Error(`The image with the following source URL already exists:\n\n${aryImageUrls_png[i]}`);

		if (imagePackage.urlToSrcImage.length < 1)
			throw new Error(`The image with the following source URL resulted in an empty S3 source URL:\n\n${aryImageUrls_png[i]}`);

		imagePackage.imageFormat = 'jpeg';

		// Convert the image to a base 64 encoded string.
		imagePackage.base64EncodedImageString =
			convertImageBufferToBase64ImageUri(imagePackage.imageBuffer, imagePackage.imageFormat);

		// Accumulate the S3 image URLs to be sent to the client.
		aryS3ImageUrls_jpg.push(imagePackage.urlToOurS3Image);

		// Accumulate the image package objects to be used with the
		//  vision recognition call.
		aryImagePackages.push(imagePackage);
	}

	// -------------------- END  : CONVERT TO JPG IF NECESSARY ------------

	// -------------------- BEGIN: SEND IMAGE RESULT TO CLIENT ------------

	console.info(CONSOLE_CATEGORY, `SIMULATED CLIENT RESPONSE:\n\n${responseSentToClient}`)

	if (client) {
		let newState = initialState

		sendImageMessage(client, { urls: aryS3ImageUrls_jpg})

		// Make sure the "waiting for images" state is set
		newState.waiting_for_images = false
		newState.state_change_message = ''

		sendStateMessage(client, newState);
	}

	// -------------------- END  : SEND IMAGE RESULT TO CLIENT ------------

	// Clear flags.
	const state = {
		streaming_audio: false,
		streaming_text: false,
		waiting_for_images: false,
		current_request_id: "",
	};

	return aryImageUrls_png
}

/**
 * This function does the necessary tasks to build a Tweet
 *  that will share the given image on Twitter.
 *
 * @param client - The client connection making the share
 *  request.
 * @param userId - The user ID that wants to share the
 *  image on Twitter.
 * @param imageUrl - The image URL to the image to be
 *  shared on Twitter.
 * @param dimensions - The image dimensions
 * @param clientUserMessage - The user message the
 *  client front-end passed to us with the share
 *  request, that we will return to them.
 *
 * @return - Returns the twitter card details made
 *  for the Twitter share request.
 */
export async function shareImageOnTwitter(
	client: WebSocket,
	userId: string,
	imageUrl: string,
	dimensions: ImageDimensions,
	clientUserMessage: string) : Promise<TwitterCardDetails> {
	if (!userId || userId.trim().length < 1)
		throw new Error(`The user ID is empty or invalid.`);

	if (!imageUrl || imageUrl.trim().length < 1)
		throw new Error(`The image URL is empty or invalid.`);

	// -------------------- BEGIN: CREATE TWEET TEXT FROM PROMPT ------------

	// First, we get the prompt of the last generated image

	sendSimpleStateMessage(client,'Preparing tweet...')

	// Get the image assistant chat history object for the given user.
	const chatHistoryObj =
		await readChatHistory(userId, EnumChatbotNames.IMAGE_ASSISTANT);

	// Get the last chat volley.
	const lastChatVolleyObj =
		chatHistoryObj.getLastVolley()

	if (!lastChatVolleyObj)
		throw new Error(`There is no chat history for user ID: ${userId}`);

	const imageGenPrompt =
		lastChatVolleyObj.prompt;

	if (imageGenPrompt.length < 1)
		throw new Error(`The image generation prompt is empty for user ID: ${userId}`);

	console.info(CONSOLE_CATEGORY, `>>>>> Making image generation prompt to Tweet text LLM completion request <<<<<`)

	sendSimpleStateMessage(client, 'Creating tweet message from the image generation prompt...')

	const textCompletion =
		await sambaNovaChatCompletionImmediate(
			'IMAGE-GENERATION-PROMPT-TO-TWEET',
			g_ImageGenPromptToTweetPrompt,
			imageGenPrompt,
			g_TextCompletionParams,
			true,
			null);

	if (textCompletion.is_error)
		throw new Error(`The image generation prompt to tweet LLM returned the following error:\n\n${textCompletion.error_message}`);


	// ImageGenPromptToTweetLlmJsonResponse
	const jsonResponse =
		textCompletion.json_response as ImageGenPromptToTweetLlmJsonResponse;

	sendSimpleStateMessage(client, 'Saving Livepeer image to permanent storage...')

	// Put the image in our S3 bucket.
	const fullS3UriToImage =
		await putLivepeerImageToS3(userId, imageUrl)

	const aryHashTags = ['AIArt'];

	// Build the Twitter card URL that links back to our server.
	//
	// Twitter intent/tweet base URL
	const twitterShareBaseUrl = "https://twitter.com/intent/tweet";

	// Construct the full URL to open the Twitter share dialog
	//  with the embedded twitterCardUrl that sends the Twitter
	//  share intent server to our GET URL for Twitter card
	//  metadata.

	// Ensure imageUrl is a valid URL and uses HTTPS protocol
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(imageUrl);
	} catch (err) {
		throw new Error(`imageUrl is not a valid URL: ${imageUrl}`);
	}

	const imageIdWithExt =
		parsedUrl.pathname.split('/').pop();

	if (!imageIdWithExt || imageIdWithExt.length < 1)
		throw new Error(`Invalid or empty image iD.`);

	// Remove the file extension.
	const imageId =
		imageIdWithExt.split('.')[0];

	// Base URL for the Fastify route that serves the Twitter Card metadata
	const ourTwitterCardRoute =
		getEnvironmentVariableByName("TWITTER_CARD_BASE_URL") ?? 'https://plasticeducator.com';

	// Create the URL pointing to your Fastify route, which will serve up the metadata for the Twitter Card
	const twitterCardUrl = `${ourTwitterCardRoute}/twitter-card/${imageId}`;

	const fullTwitterCardUrl =
		`${twitterShareBaseUrl}?url=${encodeURIComponent(twitterCardUrl)}`;

	console.info(CONSOLE_CATEGORY, `Full Twitter card URL:\n\n${fullTwitterCardUrl}`)

	// -------------------- END  : CREATE TWEET TEXT FROM PROMPT ------------

	// -------------------- BEGIN: SAVE TWITTER CARD DETAILS TO DISK ------------


	// Save the Twitter card details to a file that
	//  our Twitter card GET route can use to build
	//  the Twitter card.
	const twitterCardDetails: TwitterCardDetails =
		{
			card: "summary",
			tweet_text: jsonResponse.tweet_text,
			hash_tags_array: aryHashTags,
			twitter_card_title: jsonResponse.twitter_card_title,
			twitter_card_description: jsonResponse.twitter_card_description,
			url_to_image: fullS3UriToImage,
			dimensions: dimensions,

			// This is a copy of the full Twitter card URL
			//  that is here for convenience purposes to
			//  help the caller.
			twitter_card_url: twitterCardUrl,

			// This field contains the custom
			//  value, if any, that the client passed
			//  to the back-end server during
			//  a request to it, in the
			//  TwitterCardDetails object.
			client_user_message: clientUserMessage
		}

	// Save the Twitter card details to disk.
	writeTwitterCardDetails(imageId, twitterCardDetails)

	// -------------------- END  : SAVE TWITTER CARD DETAILS TO DISK ------------

	// Return the twitter card URL.
	return twitterCardDetails
}

// -------------------- END  : MAIN FUNCTION ------------
