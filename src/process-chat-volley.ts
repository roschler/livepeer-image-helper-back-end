// This module includes code for processing a chat volley.

import type WebSocket from "ws"
import {
	ChatVolley,
	CurrentChatState_image_assistant, CurrentChatState_license_assistant, EnumChatbotNames, PilTermsExtended,
	readChatHistory, StringOrNull,
	writeChatHistory,
} from "./chat-volleys/chat-volleys"
import {
	DEFAULT_GUIDANCE_SCALE, DEFAULT_IMAGE_GENERATION_MODEL_ID, DEFAULT_NUMBER_OF_IMAGE_GENERATION_STEPS,
	enumImageGenerationModelId,
	IntentJsonResponseObject,
} from "./enum-image-generation-models"
import {
	buildChatBotSystemPrompt_image_assistant,
	buildChatBotSystemPrompt_license_assistant, buildChatHistorySummary,
	g_ExtendedWrongContentPrompt,
	g_ImageGenPromptToTweetPrompt,
	g_TextCompletionParams,
	g_TextCompletionParamsForIntentDetector, g_TextCompletionParamsLicenseAssistant,
	processAllIntents, readImageGenerationSubPromptOrDie,
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
	NUM_STEPS_ADJUSTMENT_VALUE,
} from "./intents/enum-intents"
import { chatCompletionImmediate } from "./openai-common"
import {
	ImageGeneratorLlmJsonResponse,
	ImageGenPromptToTweetLlmJsonResponse, LicenseAssistantNuevoResponse,
	LicenseTermsLlmJsonResponse,
} from "./openai-parameter-objects"
import {
	generateImages_chat_bot,
	sendImageMessage,
	sendJsonObjectMessage,
	sendStateMessage,
	sendTextMessage,
} from "./system/handlers"
import { ImageDimensions, StateType, TwitterCardDetails } from "./system/types"
import { putLivepeerImageToS3 } from "./aws-helpers/aws-image-helpers"
import { URL } from "url"
import { writeTwitterCardDetails } from "./twitter/twitter-helper-functions"
import { sendSimpleStateMessage, writeTextFile } from "./common-routines"

const CONSOLE_CATEGORY = 'process-chat-volley'

// These are the registered "simple" licenses Story Protocol
//  has made available to us.
export enum EnumStoryProtocolLicenses {
	NON_COMMERCIAL_SOCIAL_REMIXING = "Non-Commercial Social Remixing",
	COMMERCIAL_USE = "Commercial Use",
	COMMERCIAL_REMIX = "Commercial Remix"
}

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

			// Iterate its child objects and look for a child object
			//  with the desired property name.
			jsonResponseObjExt.array_child_objects.forEach(
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
			// Iterate its child objects and look for a child object
			//  with the desired property name.
			const bTestValue =
				jsonResponseObjExt.array_child_objects.some(
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
	console.info(CONSOLE_CATEGORY, `Doing intents through OpenAI...`)

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
	console.info(CONSOLE_CATEGORY, `Adorned user input:\n\n${adornedUserInput}\n\n`)

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
		await chatCompletionImmediate(
			userReplyType,
			systemAndUserPromptToLLM.systemPrompt,
			systemAndUserPromptToLLM.userPrompt,
			// g_TextCompletionParams,
			g_TextCompletionParamsLicenseAssistant,
			true);

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
			systemAndUserPromptToLLM.systemPrompt + ' <=> ' + systemAndUserPromptToLLM.userPrompt
		)

	chatHistoryObj.addChatVolley(newChatVolleyObj)

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
					await chatCompletionImmediate(
						'LICENSE-ASSISTANT-EXPLAINER',
						licenseExplainerSystemPromptText,
						pilTermsAsUserInput,
						g_TextCompletionParams,
						false);
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

// -------------------- BEGIN: MAIN FUNCTION ------------

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
 *
 * @return - Returns the array of images generated if
 *  successful, throws an error if not.
 */
export async function processImageChatVolley(
		client: WebSocket | null,
		initialState: StateType,
		userId_in: string,
		userInput_in: string): Promise<string[]> {

	const userId = userId_in.trim()

	if (userId.length < 1)
		throw new Error(`The user ID is empty or invalid.`);

	const userInput = userInput_in.trim()

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
		chatVolley_previous?.chat_state_at_start_image_assistant ?? CurrentChatState_image_assistant.createDefaultObject();

	// Make a clone of the starting chat state so that we can
	//  have it as a reference as we make state changes.
	const chatState_current =
		chatState_start.clone();

	/*
	const result =
		await executeIntentCompletion(
			enumIntentDetectorId_image_assistant.IS_TEXT_WANTED_ON_IMAGE,
			g_TextCompletionParamsForIntentDetector,
			userInput)

	console.info(`${errPrefix}result object:`);
	console.dir(result, {depth: null, colors: true});
	 */

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

		// Run the user input by all intents.
		console.info(CONSOLE_CATEGORY, `Doing intents through OpenAI...`)

		const aryIntentDetectResultObjs =
			await processAllIntents(
				Object.values(enumIntentDetectorId_image_assistant),
				g_TextCompletionParamsForIntentDetector,
				userInput)

		// Dump the user input to the console.
		console.info(CONSOLE_CATEGORY, `UserInput:\n\n${userInput}\n\n`)

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

		// -------------------- BEGIN: EXTENDED WRONG CONTENT DETECTOR ------------

		// The extended wrong content detector is handled separately
		//  because we need to push text into the prompt for it.

		// Prepare the EXTENDED wrong content prompt.
		const previousImageGenPrompt =
			previousChatVolleyPrompt ?? '';

		const evalStrExtendedWrongContent =
			'`' + g_ExtendedWrongContentPrompt + '`';

		const evaluatedExtendedWrongContent =
			eval(evalStrExtendedWrongContent);

		// Make a separate completion call for it.
		console.info(CONSOLE_CATEGORY, `>>>>> Making extended wrong content detector completion request <<<<<`)

		const textCompletion =
			await chatCompletionImmediate(
				'EXTENDED-WRONG-CONTENT-PROMPT',
				evaluatedExtendedWrongContent,
				userInput,
				g_TextCompletionParams,
				true);

		if (textCompletion.is_error)
			throw new Error(`The extended wrong content detector completion call failed with error: ${textCompletion.error_message}`);

		const extWrongContentJsonResponseObj: IntentJsonResponseObject =
			{
				intent_detector_id: enumIntentDetectorId_image_assistant.USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT,
				array_child_objects: textCompletion.json_response as object[]
			}

		if (extWrongContentJsonResponseObj.array_child_objects.length > 0) {
			// The extended wrong content detector has a tendency
			//  to replace the complaint_type property name with
			//  something it deems more appropriate.  So if we
			//  don't find a complaint_type property, we add it
			//  with the value "wrong_content" because the only
			//  thing it detects is wrong content.
			let bIsMissingComplaintType = true;
			let strComplaintText = "(none)";

			// Check if any child object has "wrong_content" as the complaint_type
			bIsMissingComplaintType = !extWrongContentJsonResponseObj.array_child_objects.some(
				(childObj: any) => childObj.complaint_type === "wrong_content"
			);

			// If no "wrong_content" object found, search for the
			//  first object with "complaint_text" and set
			//  strComplaintText its value.  We use this
			//  technique because when the LLM makes the
			//  mistake we are fixing, it has, so far,
			//  produced the JSON object with
			//  "complaint_text" having the correct value.
			if (bIsMissingComplaintType) {
				const firstComplaintTextObj = extWrongContentJsonResponseObj.array_child_objects.find(
					(childObj: any) => childObj.complaint_text
				);

				if (firstComplaintTextObj) {
					strComplaintText = (firstComplaintTextObj as unknown as any).complaint_text;
				}

				// Add a new child object to the array with the
				//  correct complaint_type value of "wrong_content".
				extWrongContentJsonResponseObj.array_child_objects.push({
					complaint_type: "wrong_content",
					complaint_text: strComplaintText
				});
			}
		}

		// Add it to the array of intent detection JSON response objects.
		aryIntentDetectorJsonResponseObjs.push(extWrongContentJsonResponseObj)

		// -------------------- END  : EXTENDED WRONG CONTENT DETECTOR ------------

		// -------------------- BEGIN: INTENT DETECTIONS TO STATE CHANGES ------------

		// Now we examine the JSON response objects received from
		//  the intent detections to see if we should make any
		//  state changes.

		// >>>>> Start new image?
		const bIsStartNewImageDetected =
			getBooleanIntentDetectionValue(
				aryIntentDetectorJsonResponseObjs,
				enumIntentDetectorId_image_assistant.START_NEW_IMAGE,
				'start_new_image'
			);

		if (bIsStartNewImageDetected == true) {
			bIsStartNewImage = true;

			// Reset image generation parameters
			//  to the defaults.
			chatState_current.guidance_scale = DEFAULT_GUIDANCE_SCALE
			chatState_current.steps = DEFAULT_NUMBER_OF_IMAGE_GENERATION_STEPS
			chatState_current.model_id = DEFAULT_IMAGE_GENERATION_MODEL_ID
			chatState_current.loras = {}

			console.info(CONSOLE_CATEGORY, `Image generation parameters reset to the defaults, due to a start new image request.`)
		}

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

				aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_BE_LESS_CREATIVE)
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

		if (bIsImageGenerationTooSlow) {
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
		const bIsImageBoring =
			isStringIntentDetectedWithMatchingValue(
				aryIntentDetectorJsonResponseObjs,
				enumIntentDetectorId_image_assistant.USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT,
				'complaint_type',
				'boring'
			);

		// We favor the wrong content or misspelled complaint over the image is
		//  boring complaint.
		if (bIsWrongContent || bIsMisspelled) {
			// TODO: There should be an upper limit here.

			// Increase the guidance value.
			chatState_current.guidance_scale += NUM_GUIDANCE_SCALE_ADJUSTMENT_VALUE

			aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_BE_LESS_CREATIVE)

			// Misspellings are the worst offense.
			if (bIsMisspelled) {
				// Make absolutely sure we are using Flux!
				if (chatState_current.model_id !== enumImageGenerationModelId.FLUX) {
					chatState_current.model_id = enumImageGenerationModelId.FLUX

					aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_USE_TEXT_ENGINE)
				}

				// Increase the number of steps used but by three times as much as normal.
				chatState_current.steps += 3 * NUM_STEPS_ADJUSTMENT_VALUE

				aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_A_LOT_MORE_STEPS)
			} else if (bIsWrongContent) {
				aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_BE_LESS_CREATIVE)
			}

			// If we also have a boring image complaint, modify the change
			//  description to tell the user that we will concentrate on
			//  getting the image content correct first.
			if (bIsImageBoring)
				aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_BE_CREATIVE_LATER)
		} else if (bIsImageBoring) {
			// Decrease the guidance value.
			chatState_current.guidance_scale -= NUM_GUIDANCE_SCALE_ADJUSTMENT_VALUE

			if (chatState_current.steps < MIN_STEPS)
				chatState_current.steps = MIN_STEPS;

			aryChangeDescriptions.push(enumChangeDescription.CHANGE_DESC_BE_MORE_CREATIVE)
		}

		// -------------------- END  : VARIATION UP/DOWN TRIAGE ------------

		// -------------------- END  : INTENT DETECTIONS TO STATE CHANGES ------------
	}

	// -------------------- END  : INTENT DETECTOR PRE-STEP ------------

	// -------------------- BEGIN: MAIN IMAGE GENERATOR PROMPT STEP ------------

	console.info(CONSOLE_CATEGORY, `----------------------- MAIN LLM INTERACTION ---------------\n\n`)

	// Now we need to get help from the LLM on creating or refining
	//  a good prompt for the user.
	const fullPromptToLLM =
		buildChatBotSystemPrompt_image_assistant(
			userInput,
			wrongContentText,
			chatHistoryObj,
			bIsStartNewImage)

	console.info(CONSOLE_CATEGORY, `>>>>> Making main LLM text completion request <<<<<`)

	const textCompletion =
		await chatCompletionImmediate(
			'MAIN-IMAGE-GENERATION-PROMPT',
			fullPromptToLLM,
			userInput,
			g_TextCompletionParams,
			true);

	// Type assertion to include 'revised_image_prompt'
	const jsonResponse = textCompletion.json_response as ImageGeneratorLlmJsonResponse;

	const revisedImageGenPrompt = jsonResponse.prompt;

	if (revisedImageGenPrompt === null ||
		(typeof revisedImageGenPrompt === 'string' && revisedImageGenPrompt.length < 1))
		throw new Error(`The revised image generation prompt is invalid or empty.`);

	// The negative prompt may be empty.
	const revisedImageGenNegativePrompt =
		jsonResponse.negative_prompt ?? '';

	// -------------------- END  : MAIN IMAGE GENERATOR PROMPT STEP ------------

	// -------------------- BEGIN: CREATE RESPONSE FOR USER ------------

	// We build a response to be shown to the user by the
	//  client using what we have so far.
	// Build the response we send to the user.  We show
	//  them the prompt the LLM gave us that we sent
	//  to the image generation model, and the
	//  text we assembled to tell the user what we
	//  did in response to feedback they gave us
	//  about the last image generation.

	let responseSentToClient: string =
		`Here is the new image request we just made:\n\n"${revisedImageGenPrompt}"\n`

	if (aryChangeDescriptions.length > 0) {
		const uniqueChangeDescriptions = [...new Set(aryChangeDescriptions)];

		responseSentToClient +=
			`\nand the changes I made to improve the result:\n\n${uniqueChangeDescriptions.join('\n')}\n`
	}

	responseSentToClient += `\nLet's see how this one turns out`

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

	const newChatVolleyObj =
		new ChatVolley(
			false,
			null,
			userInput,
			revisedImageGenPrompt,
			revisedImageGenNegativePrompt,
			textCompletion,
			responseSentToClient,
			chatState_start,
			chatState_current,
			null,
			null,
			aryIntentDetectorJsonResponseObjs,
			fullPromptToLLM
		)

	chatHistoryObj.addChatVolley(newChatVolleyObj)

	// Update storage.
	writeChatHistory(userId, chatHistoryObj, EnumChatbotNames.IMAGE_ASSISTANT)

	// -------------------- END  : UPDATE CHAT HISTORY ------------

	// -------------------- BEGIN: MAKE IMAGE REQUEST ------------

	const aryImageUrls =
		// https://dream-gateway.livepeer.cloud/text-to-image
		await generateImages_chat_bot(
			revisedImageGenPrompt,
			jsonResponse.negative_prompt,
			chatState_current)

	// -------------------- END  : MAKE IMAGE REQUEST ------------

	// -------------------- BEGIN: SEND IMAGE RESULT TO CLIENT ------------

	console.info(CONSOLE_CATEGORY, `SIMULATED CLIENT RESPONSE:\n${responseSentToClient}`)

	if (client) {
		let newState = initialState

		sendImageMessage(client, { urls: aryImageUrls})

		// Make sure the "waiting for images" state is set
		newState.waiting_for_images = false
		newState.state_change_message = ''

		sendStateMessage(client, newState)
	}

	// -------------------- END  : SEND IMAGE RESULT TO CLIENT ------------

	// Clear flags.
	const state = {
		streaming_audio: false,
		streaming_text: false,
		waiting_for_images: false,
		current_request_id: "",
	};

	return aryImageUrls
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
		await chatCompletionImmediate(
			'IMAGE-GENERATION-PROMPT-TO-TWEET',
			g_ImageGenPromptToTweetPrompt,
			imageGenPrompt,
			g_TextCompletionParams,
			true);

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
	const ourTwitterCardRoute = process.env.TWITTER_CARD_BASE_URL || 'https://plasticeducator.com';

	// Create the URL pointing to your Fastify route, which will serve up the metadata for the Twitter Card
	const twitterCardUrl = `${ourTwitterCardRoute}/twitter-card/${imageId}`;

	const fullTwitterCardUrl =
		`${twitterShareBaseUrl}?url=${encodeURIComponent(twitterCardUrl)}`;

	console.info(CONSOLE_CATEGORY, `Full Twitter card URL:\n${fullTwitterCardUrl}`)

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
