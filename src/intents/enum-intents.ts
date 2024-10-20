// This module contains the IDs for the intents we created and some other
//  elements related to changes we make because of detected intents.

// This is the number of steps to adjust an image generation
//  request by, up or down, based on feedback from the user.
export const NUM_STEPS_ADJUSTMENT_VALUE = 3;

// This is the amount to adjust the guidance scale during
// an image generation, up or down, based on feedback from the user.
export const NUM_GUIDANCE_SCALE_ADJUSTMENT_VALUE = 3;

// This is the minimum guidance scale we use with images
//  that have text on them, to decrease the chances of
//  misspelled words or distorted text, or if the user
//  has made a wrong content complaint.
export const MIN_GUIDANCE_SCALE_IMAGE_TEXT_OR_WRONG_COMPLAINT_VALUE = 28;

// This is the minimum number of steps we will make an
//  image generation call with.
export const MIN_STEPS = 1;

// This is the minimum number of steps we use with images
//  that have text on them, to decrease the chances of
//  misspelled words or distorted text, or if the user
//  has made a wrong content complaint.
export const MIN_STEPS_FOR_IMAGE_ON_TEXT_OR_WRONG_CONTENT_COMPLAINT = 21;


// -------------------- BEGIN: enumIntentDetectorId_image_assistant ------------

// These are the IDs for each of the INTENT detectors we have created
//  so far.  They must be unique!

/**
 * Enum that contains all the intent detector IDs
 *  for the image assistant.
 *
 * NOTE: Some detected attributes, for example,
 * the "boring" image detection, is part of a
 * large detection.  In the "boring" example,
 * that attribute is one of the detections of the
 * USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT
 * intent detector.
 */
export enum enumIntentDetectorId_image_assistant {
	// User does or does not want text on the generated image.
	IS_TEXT_WANTED_ON_IMAGE = "is_text_wanted_on_image",
	// User is complaining about the image quality.
	USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT = "user_complaint_image_quality_or_content",
	// User is complaining about the generation speed.
	USER_COMPLAINT_IMAGE_GENERATION_SPEED = "user_complaint_speed_image_generation_speed",
	// User wants to start a brand new image.
	START_NEW_IMAGE = "start_new_image"
}

// -------------------- END  : enumIntentDetectorId_image_assistant ------------

// -------------------- BEGIN: enumChangeDescription ------------

/**
 *
 * An enumerator that has all the changes descriptions

 *
 * @type {Readonly<{string}>}
 */
export enum enumChangeDescription{
	"CHANGE_DESC_BE_LESS_CREATIVE" = "* I have told the engine to be less creative",
	"CHANGE_DESC_BE_MORE_CREATIVE" = "* I have told the engine to be more creative",
	"CHANGE_DESC_USE_TEXT_ENGINE" = "* I have switched to a text capable engine.  Note, image generations will take much longer to generate",
	"CHANGE_DESC_USE_FLUX_ENGINE" = "* I have switched to the Flux engine, image generations will take much longer to generate",
	"CHANGE_DESC_LESS_STEPS" = "* I have decreased the time spent on image generation to make things faster",
	"CHANGE_DESC_MORE_STEPS" = "* I have increased the time spent on image generation to improve quality",
	"CHANGE_DESC_FIX_WRONG_CONTENT" = "* I will try to fix the incorrect content",
	"CHANGE_DESC_A_LOT_MORE_STEPS" = "* I have greatly increased the time spent on image generation.  Please be patient, since it will take longer to create images now.",
	"CHANGE_DESC_BE_CREATIVE_LATER" = "Let's concentrate on getting the image content correct before trying to be more creative.",
}

/**
 * This function returns TRUE if the given value is a valid
 *   enumChangeDescription value, FALSE if not.
 */
export function isValidEnumChangeDescription(enChangeDescription: string) {
	const errPrefix = `(isValidEnumChangeDescription) `

	return Object.values(enumChangeDescription).includes(enChangeDescription as enumChangeDescription)
}

// -------------------- END  : enumChangeDescription ------------

// -------------------- BEGIN: LICENSE ASSISTANT INTENTS ------------

/**
 * Enum that contains all the intent detector IDs for
 *  the license assistant
 *
 * NOTE: Some detected attributes, for example,
 * the "boring" image detection, is part of a
 * large detection.  In the "boring" example,
 * that attribute is one of the detections of the
 * USER_COMPLAINT_IMAGE_QUALITY_OR_WRONG_CONTENT
 * intent detector.
 */
export enum enumIntentDetectorId_license_assistant {
	// Determine the nature of a user's input.
	DETERMINE_USER_INPUT_TYPE = "determine_user_input_type",
	// Recognize seemingly general replies by the user that
	//  are actually specific license terms.
	DETECT_USER_INPUT_AS_LICENSE_TERM = "detect_user_input_as_license_term"
}


// -------------------- END  : LICENSE ASSISTANT INTENTS ------------