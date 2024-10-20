// This module contains code to help with interfacing with
//  Twitter.

import { TwitterCardDetails } from "../system/types"
import { getCurrentOrAncestorPathForSubDirOrDie } from "../common-routines"
import path from "node:path"
import { readJsonFile, writeJsonFile } from "../json/json-file-substitute"
import fs from "fs"

const CONSOLE_CATEGORY = 'twitter-helper-functions';

/**
 * The directory where twitter card details files are stored.
 * @constant
 * @type {string}
 */
export const DIR_TWITTER_CARD_DETAILS = 'twitter-card-details';

/**
 * Builds the full path to the image's twitter card details file.
 *
 * @param {string} imageId - The ID of the image to build the file name for.
 * @returns {string} The full path to a twitter card details JSON file.
 * @throws {Error} If the imageId is empty or contains invalid characters for a file name.
 */
export function buildTwitterCardDetailsFilename(imageId: string): string {
	const trimmedImageId = imageId.trim();

	// Validate that the imageId is not empty
	if (!trimmedImageId) {
		throw new Error('Image ID ID cannot be empty.');
	}

	// Validate that the imageId contains no invalid characters for a file name
	const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
	if (invalidChars.test(trimmedImageId)) {
		throw new Error('Image ID contains invalid characters for a file name.');
	}

	// Get the subdirectory for twitter card details files.
	const resolvedFilePath =
		getCurrentOrAncestorPathForSubDirOrDie(CONSOLE_CATEGORY, DIR_TWITTER_CARD_DETAILS);

	// Build the full path to the twitter card details file
	const primaryFileName = `${trimmedImageId}-twitter-card-details.json`;

	// Construct the path dynamically
	const fullFilePath = path.join(resolvedFilePath, primaryFileName);

	return fullFilePath
}


/**
 * Writes the TwitterCardDetails object to disk as a JSON file.
 *
 * @param {string} imageId - The image ID associated with the twitter card details.
 * @param {TwitterCardDetails} twitterCardDetails - The twitter card details object to write to disk.
 */
export function writeTwitterCardDetails(imageId: string, twitterCardDetails: TwitterCardDetails): void {
	const filename = buildTwitterCardDetailsFilename(imageId);
	const jsonData = JSON.stringify(twitterCardDetails, null, 2);  // Pretty print the JSON

	writeJsonFile(filename, jsonData);
}

/**
 * Reads the twitter card details for a given image id.
 *
 * @param {string} imageId - The image ID whose twitter card details should be read.
 *
 * @returns {TwitterCardDetails} The twitter card details object for the given image id.  If one does not exist yet, NULL will be returned.
 */
export async function readTwitterCardDetails(imageId: string): Promise<TwitterCardDetails|null>  {
	const trimmedImageId = imageId.trim()

	// Validate that the imageId is not empty
	if (!trimmedImageId) {
		throw new Error('Image ID cannot be empty.');
	}

	// Build the full path to the twitter card details file
	const fullPathToJsonFile = buildTwitterCardDetailsFilename(trimmedImageId);

	// Check if the file exists
	if (fs.existsSync(fullPathToJsonFile)) {
		// -------------------- BEGIN: LOAD EXISTING FILE ------------

		const filename = buildTwitterCardDetailsFilename(imageId);
		const jsonData = readJsonFile(filename);
		const parsedData = JSON.parse(jsonData) as TwitterCardDetails;

		return parsedData

		// -------------------- END  : LOAD EXISTING FILE ------------
	} else {
		// A Twitter card details file does not exist yet
		//  for the given image ID.
		return null
	}
}