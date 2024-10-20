// This module contains some utility functions.

import * as fs from 'fs';
import path from "node:path"
import type WebSocket from "ws"
import { StateType } from "./system/types"
import { getDefaultState } from "./chat-volleys/chat-volleys"
import { sendStateMessage } from "./system/handlers"

/**
 * Reads the given string content from the specified file path.
 *
 * @param {string} fullFilePath - The full path to the file.
 *
 * @returns {string | null} - Returns the contents of the file if
 *  it exists, or NULL if not.
 */
export function readTextFile(fullFilePath: string): string | null {
	const errPrefix = '(readTextFile) ';

	// Validate fullFilePath
	if (typeof fullFilePath !== 'string' || fullFilePath.trim() === '') {
		throw new Error(`${errPrefix}fullFilePath must be a non-empty string.`);
	}

	let fileContent: string | null = null;

	try {
		fileContent = fs.readFileSync(fullFilePath, 'utf8');
	} catch (err) {
		throw new Error(`${errPrefix}Failed to read file: ${(err as Error).message}`);
	}

	return fileContent;
}

/**
 * Writes the given string content to the specified file path.
 * The file path and content are validated for correctness.
 *
 * @param {string} fullFilePath - The full path to the file.
 * @param {string} strContent - The string content to write to the file.
 *
 * @returns {boolean} - Returns true on successful write, or
 *  throws an error if the operation fails.
 */
export function writeTextFile(fullFilePath: string, strContent: string): boolean {
	const errPrefix = '(writeTextFile) ';

	// Validate fullFilePath
	if (typeof fullFilePath !== 'string' || fullFilePath.trim() === '') {
		throw new Error(`${errPrefix}fullFilePath must be a non-empty string.`);
	}

	// Validate strContent
	if (typeof strContent !== 'string') {
		throw new Error(`${errPrefix}strContent must be a string.`);
	}

	try {
		fs.writeFileSync(fullFilePath, strContent, 'utf8');
		return true;
	} catch (err) {
		throw new Error(`${errPrefix}Failed to write to file: ${(err as Error).message}`);
	}
}


/**
 * Helper function to get the current Unix timestamp.
 *
 * @returns {number} - The current Unix timestamp.
 */
export function getUnixTimestamp(): number {
	return Math.floor(Date.now() / 1000);
}


/**
 * This function was created to cope with the variance between
 *  directory trees between development and production builds,
 *  since in production.
 *
 * @param consoleCategory - The console category to use for
 *  emitting console messages
 *
 * @param subDirToFind - The subdirectory to locate
 *
 * @returns - Returns the fully resolved path to where the
 *  subdirectory was found, or throws an error if it could
 *  not be found.
 */
export function getCurrentOrAncestorPathForSubDirOrDie(consoleCategory: string, subDirToFind: string) {
	// Get the current working directory
	const cwd = process.cwd();

	console.info(consoleCategory, `Attempting to resolve sub-directory:\n${subDirToFind}`)

	const devOrProdDirCheck = subDirToFind;
	let subDirFound =  devOrProdDirCheck

	if (!fs.existsSync(subDirToFind)) {
		// Check the ancestor directory.
		const ancestorPath =
			path.resolve(path.join('..', devOrProdDirCheck))

		if (fs.existsSync(ancestorPath)) {
			subDirFound = ancestorPath
		} else {
			const errMsg =
				`Unable to find needed sub-directory:\n${devOrProdDirCheck}`
			console.error(consoleCategory, errMsg)

			throw new Error(errMsg);
		}
	}

	// Construct the path dynamically
	const resolvedFilePath =
		// path.join(DIR_FOR_IMAGE_GENERATION_PROMPTS, primaryFileName)
		path.resolve(cwd, subDirFound);

	console.info(consoleCategory, `resolvedFilePath:\n${resolvedFilePath}`)

	return resolvedFilePath
}


// This function sends a state update message, but with
//  all the other fields besides the state_change_message
//  set to their default values.
export function sendSimpleStateMessage(client: WebSocket, stateChangeMessage: string) {
	if (!stateChangeMessage || stateChangeMessage.length < 1)
		throw new Error(`The state change message is empty.`);

	let newState: StateType = getDefaultState({ state_change_message: stateChangeMessage})

	sendStateMessage(client, newState)
}

