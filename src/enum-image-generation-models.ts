// This module contains code related to image generation models.

// -------------------- BEGIN: enumImageGenerationModelId ------------

// These are the IDs for each of the image generation model
//  IDs we currently support.

/**
 * Enum that contains all the image generation models we
 *  currently support.
 */
export enum enumImageGenerationModelId {
	// The ByteDance lightning model.
	BYTEDANCE_LIGHTNING = "ByteDance/SDXL-Lightning",
	// The RealVisXL lightning model.  This model does
	//  great dinosaurs!
	REALVIS_LIGHTNING = "SG161222/RealVisXL_V4.0_Lightning",
	// The Black Forest FLUX model.
	FLUX = "black-forest-labs/FLUX.1-dev",
}

/**
 * This function returns TRUE if the given value is a valid
 *   enumIntentDetectorId_image_assistant value, FALSE if not.
 */
export function isValidEnumImageGenerationModelId(enImageGenerationModelId: string) {
	return Object.values(enumImageGenerationModelId).includes(enImageGenerationModelId as enumImageGenerationModelId);
}

// -------------------- END  : enumIntentDetectorId_image_assistant ------------

// Some defaults.
// This model leads to a service unavailable message: 502
// const DEFAULT_IMAGE_GENERATION_MODEL_ID = 'RealVisXL_V4.0_Lightning';
export const DEFAULT_IMAGE_GENERATION_MODEL_ID = enumImageGenerationModelId.BYTEDANCE_LIGHTNING;
// If this value is empty, then we are not using a LoRA
//  model by default.
// const DEFAULT_LORA_MODEL_ID = '';
export const DEFAULT_GUIDANCE_SCALE = 2; // 7.5;
export const DEFAULT_NUMBER_OF_IMAGE_GENERATION_STEPS  = 20;

// Limit guidance scale from getting too high or the model
//  can easily start leaving out elements in the prompt
//  that are underrepresented in the latent space.
//
//  (See knowledge-x-guidance-and-steps-parameters.txt)
// export const MAX_GUIDANCE_SCALE = 16;

export const MAX_GUIDANCE_SCALE = 9;

// UPDATE: For some strange reason, at least with Flux/Dev,
//  excessive guidance scale values makes photorealistic images cartoons
//  or at least cartoon-ish (overly glossy, unrealistic
//  colors).
//
// UPDATE 2: Not doubtful about the above assertion,
//  so restoring it to the same maximum value as
//  MAX_GUIDANCE_SCALE.
export const MAX_GUIDANCE_SCALE_PHOTOREALISTIC = 9;


// Limit steps to 50.  More than that usually doesn't
//  provide much benefit.
//
// UPDATE: For some strange reason, at least with Flux/Dev,
//  an excessive number of steps makes photorealistic images cartoons
//  or at least cartoon-ish (overly glossy, unrealistic
//  colors).
export const MAX_STEPS = 22;

// Some helpful types.

/**
 * This interface describes the temporary objects we
 *  create from an of intent detector responses to
 *  help us with analyzing the detections.
 */
export interface IntentJsonResponseObject {
	intent_detector_id: string,
	array_child_objects: object[]
}

