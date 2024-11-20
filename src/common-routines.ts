// This module contains some utility functions.

import * as fs from 'fs';
import path from "node:path"
import type WebSocket from "ws"
import { StateType, StringOrNull } from "./system/types"
import { getDefaultState } from "./chat-volleys/chat-volleys"
import { sendStateMessage } from "./system/handlers"
import {getAwsSecret_async} from "./aws/secrets-manager/secrets-manager-helpers"

// Try to get the AWS secret for the NFT3D Live app.

const secretName = "ec2-nft3d-live-1";
let g_SecretOrEnvVars = process.env;
let g_IsSecretsSourcedEnvVars = false;

let g_GetNft3dLiveSecretAttempted = false;

// Blind call to get our AWS secret.
doTryGettingNft3dLiveSecret_promise();

export function showAppVersion() {
	console.log(`App version: 1.0.0`);
}

// -------------------- BEGIN: NOTE ABOUT ENVIRONMENT VARIABLES AND SECRETS ------------

// The strategy has changed from using environment variables to using the AWS Secrets Manager.
//  So the get environment variable functions actually look for a secrets object first and
//  use that.  If one is not found then it falls back to environment variables.

// This method returns TRUE if the current environment variable settings indicate that
//  we are on our local Linux development station.  Otherwise FALSE is returned.
export function isDevEnv(): boolean
{
	if (typeof process.env.LINUX_DEV === undefined || process.env.LINUX_DEV == null)
		// Not on development Linux station.
		return false;

	// Is the environment variable set to the value TRUE?
	let bIsDevEnv = process.env.LINUX_DEV === 'true';

	return bIsDevEnv;
}

/**
 * Simple helper function to conform error objects that may also be plain strings
 * 	to a string error message.
 *
 * @param {Object|string|null} err - The error object, or error message, or NULL.
 *
 * @return {String} - Returns the err value itself if it's a string.  If err is
 *  an object and it has a 'message property, it will return the err.message
 *  property value.  Otherwise, the default empty value is returned.
 */
export function conformErrorObjectMsg(err: any)
{
	let errMsg = '(none)';

	if (typeof err == 'string')
		errMsg = err;
	else
	{
		if (err && err.message)
			errMsg = err.message;
	}

	return errMsg;
}

/**
 * The function returns a promise that tries to get the AWS Secret object
 *  for the NFT3D Live dApp.
 *
 * @return {Promise<object|null>} - If the AWS secret object can be
 *  retrieved, it will be returned by this function.  If not, NULL
 *  will be returned.
 */
function tryGettingNft3dLiveSecret_promise(): Promise<string> {
	const errPrefix = '(tryGettingNft3dLiveSecret_promise) ';

	return new Promise(function(resolve, reject) {
		try	{
			getAwsSecret_async(secretName)
				.then((result: string) => {
					resolve(result);
				})
				.catch((err: unknown) => {
					// Convert the error to a promise rejection.
					const errMsg =
						errPrefix + conformErrorObjectMsg(err);

					reject(errMsg + ' - promise');
				});
		}
		catch(err) {
			// Convert the error to a promise rejection.
			const errMsg =
				errPrefix + conformErrorObjectMsg(err);

			reject(errMsg + ' - try/catch');
		}
	});
}


const errPrefix_local = '(common-routines::env-vars-or-secret)';

/**
 * This function tries to get our Nft3dLiveSecret secret.
 *  It MUST be called before any calls to getEnvironmentVariableByName()
 *  or getEnvironmentVarOrError() made!
 */
export async function doTryGettingNft3dLiveSecret_promise() {
	if (g_GetNft3dLiveSecretAttempted) {
		console.warn(`Nft3dLiveSecret retrieval attempt.  Ignoring.`);
		return;
	}

	console.log(`Making Nft3dLiveSecret retrieval...`);
	tryGettingNft3dLiveSecret_promise()
		.then(result => {
			if (typeof result === 'object' && result !== null) {
				// Switch to using the secret.
				g_SecretOrEnvVars = result;
				g_IsSecretsSourcedEnvVars = true;

				console.info('environment-variables-or-secret', `Using AWS secret for dApp configuration.`);
			} else {
				g_IsSecretsSourcedEnvVars = false;

				console.info('environment-variables-or-secret', `Unable to obtain AWS secret for dApp configuration.  Falling back to environment variables.`);
			}

			g_GetNft3dLiveSecretAttempted = true;
		})
		.catch(err => {
			// Convert the error to a promise rejection.
			let errMsg =
				errPrefix_local + conformErrorObjectMsg(err);

			console.error(`${errMsg} - promise`);
		});
}

// -------------------- END  : NOTE ABOUT ENVIRONMENT VARIABLES AND SECRETS ------------
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
 * @param fullFilePath - The full path to the file.
 * @param strContent - The string content to write to the file.
 * @param bAppendFile - If TRUE, then the string content
 *  will be appended to the specified file.  If FALSE, it
 *  will overwrite the contents of the specified file.
 *
 * @returns {boolean} - Returns true on successful write, or
 *  throws an error if the operation fails.
 */
export function writeTextFile(
		fullFilePath: string,
		strContent: string,
		bAppendFile: boolean=false): boolean {
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
		if (bAppendFile)
			fs.writeFileSync(fullFilePath, strContent, { encoding: 'utf8' });
		else
			fs.writeFileSync(fullFilePath, strContent, { flag: 'a', encoding: 'utf8' });

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

/**
 * Extracts the content between the first occurrence of an opening square bracket (`[`)
 * and the last occurrence of a closing square bracket (`]`) in a given string.
 *
 * @param str - The input string to process. Must be a non-empty string.
 * @returns - The content between the brackets, excluding the brackets themselves.
 *                            Returns `null` if no valid bracketed content is found.
 * @throws {Error} - Throws an error if the input is not a non-empty string.
 *
 * @example
 * const result = extractTopBracketedContent("Here is some [example content] to extract.");
 * console.log(result); // Output: "example content"
 */
export function extractTopBracketedContent(str: string): StringOrNull {
	// Validate that str is a non-empty string
	if (typeof str !== 'string' || str.length === 0) {
		throw new Error("Input must be a non-empty string");
	}

	// Find the first occurrence of an opening square bracket
	let start = -1;
	for (let i = 0; i < str.length; i++) {
		if (str[i] === '[') {
			start = i;
			break;
		}
	}

	// If no opening bracket is found, return null
	if (start === -1) {
		return null;
	}

	// Find the last occurrence of a closing square bracket
	let end = -1;
	for (let i = str.length - 1; i >= 0; i--) {
		if (str[i] === ']') {
			end = i;
			break;
		}
	}

	// If no closing bracket is found, or if it appears before the opening bracket, return null
	if (end === -1 || end <= start) {
		return null;
	}

	// Extract and return the content between the brackets
	return str.slice(start + 1, end);
}

/**
 * Extracts all unique variable names found in a template string.
 * Variable names are expected to be in the format ${variableName}.
 *
 * @param str - The template string to search for variable names.
 * @returns An array of unique variable names (strings) found
 *  in the template string, compatible with
 *  `Record<string, any>` type.
 */
export function findAllTemplateVarNames(str: string): string[] {
	if (!str || typeof str !== 'string') {
		throw new Error("The input must be a non-empty string.");
	}

	const templateVariablePattern = /\${(.*?)}/g;
	const variableNames = new Set<string>();

	let match;
	while ((match = templateVariablePattern.exec(str)) !== null) {
		const variableName = match[1].trim();
		if (variableName) {
			variableNames.add(variableName);
		}
	}

	return Array.from(variableNames);
}

/**
 * Replaces all template variable references in a given string with the values
 * provided by the `funcDoTheEval` callback, which evaluates each variable name.
 *
 * @param llmPromptToFixUp - The template string with variables in the format ${variableName}.
 * @param funcDoTheEval - A callback function that takes a variable name and returns its value.
 * @returns The fully substituted string with all template variables replaced by their values.
 * @throws An error if any referenced variable is missing in `funcDoTheEval`.
 */
export function substituteWithoutEval(llmPromptToFixUp: string, funcDoTheEval: (varName: string) => any): string {
	if (!llmPromptToFixUp || typeof llmPromptToFixUp !== 'string') {
		throw new Error("The input prompt must be a non-empty string.");
	}

	const variableNames = findAllTemplateVarNames(llmPromptToFixUp);

	// Create a Record of variable names and their evaluated values
	const variablesRecord: Record<string, any> = {};
	variableNames.forEach(variableName => {
		const value = funcDoTheEval(variableName); // Evaluates in caller's scope
		if (typeof value === 'undefined') {
			throw new Error(`Variable '${variableName}' is undefined.`);
		}
		variablesRecord[variableName] = value;
	});

	// Substitute variables in the template string using the evaluated values
	return llmPromptToFixUp.replace(/\${(.*?)}/g, (_, variableName) => {
		return String(variablesRecord[variableName]);
	});
}

/**
 * Appends an end-of-sentence (EOS) character (e.g., ".", "!", "?") to a string if not already present.
 * Validates that the input string is non-empty after trimming.
 *
 * @param str - The input string to validate and potentially modify.
 * @returns The input string with an EOS character appended if not already present.
 * @throws {Error} If the input string is empty after trimming.
 */
export function appendEosCharIfNotPresent(str: string): string {
	if (!str.trim()) {
		throw new Error("Input string cannot be empty after trimming.");
	}

	const eosChars = ['.', '!', '?'];
	return eosChars.includes(str.trim().slice(-1)) ? str : `${str}.`;
}

/**
 * This function gets the value of the environment variable
 * 	with the given name.  However, if there is an environment
 * 	variable that has the same name but prefixed with the
 * 	DEV_ extension, AND we are in development, the value
 * 	of that variable will be returned instead.
 *
 * @param {String} envVarName - The name of the desired
 * 	environment variable.
 *
 * @return {String} - Return the current value of the
 * 	desired environment variable.
 */
export function getEnvironmentVariableByName(envVarName: string) {
	const errPrefix = '(getEnvironmentVariableByName) ';

	if (!g_GetNft3dLiveSecretAttempted)
		throw new Error(`${errPrefix}The attempt to get our AWS secret has not been made yet..`)

	// Do we have a DEV_ equivalent?
	const devEnvVarName = 'DEV_' + envVarName;

	// First try the secrets cache.  If that
	//  fails, try the environment variables.
	function fallbackToEnvVar(varName: string): StringOrNull {
		const errPrefix = `(fallbackToEnvVar) `;

		if (varName.length < 1)
			throw new Error(`${errPrefix}The varName parameter is empty or invalid.`);

		// Try secrets first.
		if (g_SecretOrEnvVars[varName])
			// AWS secret found.
			return g_SecretOrEnvVars[varName];
		else if (process.env[varName])
			// Environment variable found.
			return process.env[varName];
		else
			return null;
	}

	let envOrSecretValue;

	if (isDevEnv()) {
		envOrSecretValue = fallbackToEnvVar(devEnvVarName);
	}

	// Final fallback is non-DEV secret or last resort, environment
	//  variable name.
	if (typeof envOrSecretValue === 'undefined' || envOrSecretValue === null)
		envOrSecretValue = fallbackToEnvVar(envVarName);

	return envOrSecretValue;
}

/**
 * Returns the value of the desired environment variable or throws an error if
 *  there is no environment variable with the given name.
 *
 * @param {String} envVarName - The name of the desired environment variable.
 * @param {boolean} bTrimIt - If TRUE, the environment variable value will be
 *  trimmed before being returned.  Otherwise, it won't be.
 *
 * @return {String} - The value of the environment variable with the given name.
 */
export function getEnvironmentVarOrError(envVarName:string, bTrimIt: boolean = true) {
	const errPrefix = '(getEnvironmentVarOrError) ';

	// let envVarValue = process.env[envVarName];
	let envVarValue = getEnvironmentVariableByName(envVarName);

	if (typeof envVarValue === 'undefined' || envVarValue == null)
		throw new Error(
			errPrefix
			+ 'There is no environment variable with the name: '
			+ envVarName
			+ ', or this is dev and there was no DEV_ equivalent.'
			+ '\n\nSecrets sourced environment variables: '
			+ g_IsSecretsSourcedEnvVars
			+ '\n\n');

	if (envVarValue.length < 1)
		throw new Error(errPrefix + 'The following environment variable is empty: ' + envVarName);

	if (bTrimIt)
		envVarValue = envVarValue.trim();

	return envVarValue;
}