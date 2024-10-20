// This file contains blockchain related code that only the
//  back-end server uses.

import { UserBlockchainPresence } from "./user-blockchain-presence"
import { readJsonFile, writeJsonFile } from "../json/json-file-substitute"
import { getCurrentOrAncestorPathForSubDirOrDie } from "../common-routines"
import path from "node:path"

const CONSOLE_CATEGORY = 'blockchain-server-side-only';

const DIR_USER_BLOCKCHAIN_PRESENCE = './user-blockchain-presence-files';

/**
 *
 * @param rawJson
 */
export function reconstituteUserBlockchainPresence(rawJson: any): UserBlockchainPresence {
	// Validate that the raw data is an object
	if (typeof rawJson !== 'object' || rawJson === null) {
		throw new Error('Invalid JSON structure for UserBlockchainPresence.');
	}

	// Create a new UserBlockchainPresence object
	const userBlockchainPresence = new UserBlockchainPresence(rawJson.enforceChainId || null);

	// Iterate over the properties in the raw JSON object and dynamically assign them to the instance
	Object.keys(rawJson).forEach((key) => {
		if (key in userBlockchainPresence) {
			(userBlockchainPresence as any)[key] = rawJson[key];
		}
	});

	return userBlockchainPresence;
}

/**
 * Given a user's public address, build the full file path that
 *  leads to the directory where those files are stored, with
 *  the public address as the primary file name.
 *
 * @param userPublicAddress - The user public address to use
 *  when building the file.
 *
 * @returns - Returns the full path to the user blockchain presence
 *  object using the given public address.
 */
function buildUserBlockchainPresenceFilename(userPublicAddress: string) {
	// Validate userPublicAddress
	if (!userPublicAddress || userPublicAddress.trim().length === 0) {
		throw new Error('userPublicAddress cannot be empty.');
	}

	const trimmedUserPublicAddress = userPublicAddress.trim();

	// Validate that the userId contains no invalid characters for a file name
	const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;

	if (invalidChars.test(trimmedUserPublicAddress)) {
		throw new Error('The user public address contains invalid characters for a file name.');
	}

	// Get the subdirectory for chat history files.
	const resolvedFilePath =
		getCurrentOrAncestorPathForSubDirOrDie(CONSOLE_CATEGORY, DIR_USER_BLOCKCHAIN_PRESENCE);

	// Build the full path to the chat history file
	const primaryFileName = `${trimmedUserPublicAddress}-user-blockchain-presence.json`;

	// Construct the path dynamically
	const fullFilePath = path.join(resolvedFilePath, primaryFileName);

	return fullFilePath
}

/**
 * Reads the blockchain presence of a user from a file and reconstructs it into a UserBlockchainPresence object.
 *
 * @param {string} userPublicAddress - The public address of the user.
 * @returns {Promise<UserBlockchainPresence>} - The reconstituted UserBlockchainPresence object.
 * @throws {Error} - If the public address is invalid or the file read operation fails.
 */
export async function readUserBlockchainPresence(userPublicAddress: string): Promise<UserBlockchainPresence | null> {
	// Validate userPublicAddress
	if (!userPublicAddress || userPublicAddress.trim().length === 0) {
		throw new Error('userPublicAddress cannot be empty.');
	}

	const trimmedAddress = userPublicAddress.trim();

	// Build the file path using the existing function
	const filePath = buildUserBlockchainPresenceFilename(trimmedAddress);

	// Read the raw JSON data from the file
	const rawJson: any = readJsonFile(filePath, UserBlockchainPresence.fromJsonString);

	if (!rawJson)
		return null

	const userBlockchainPresence =
		reconstituteUserBlockchainPresence(rawJson)

	return userBlockchainPresence;
}

/**
 * Writes the blockchain presence of a user to a file.
 *
 * @param {UserBlockchainPresence} userBlockchainPresenceObj - The UserBlockchainPresence object to save.
 *
 * @returns {Promise<void>} - Resolves when the write operation completes.
 * @throws {Error} - If the public address is invalid or the file write operation fails.
 */
export async function writeUserBlockchainPresence(
	userBlockchainPresenceObj: UserBlockchainPresence
): Promise<void> {
	// Validate userPublicAddress
	if (!userBlockchainPresenceObj.publicAddress || userBlockchainPresenceObj.publicAddress.trim().length === 0) {
		throw new Error('userPublicAddress cannot be empty.');
	}

	const trimmedAddress = userBlockchainPresenceObj.publicAddress.trim();

	// Build the file path using the existing function
	const filePath = buildUserBlockchainPresenceFilename(trimmedAddress);

	// Use Object.assign or spread operator to create a shallow copy of the object
	const dataToWrite = { ...userBlockchainPresenceObj };

	// Write the JSON data to the file
	writeJsonFile(
		filePath,
		dataToWrite,
		// We use an anonymous function, or we will lose the
		//  "this" pointer, and an anonymous function looks
		//  cleaner than using bind().
		() => userBlockchainPresenceObj.toJsonString());
}
