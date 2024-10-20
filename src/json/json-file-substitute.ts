// This is our quick, simple replacement for the jsonfile
//  package, which for some reason we can't use with our
//  repository.

import fs from "fs"

/**
 * Reads a JSON file.
 *
 * @param filePath - The full path to the user's chat history JSON file.
 * @param funcParse - If a custom JSON parsing function is required,
 *  pass it here.  Otherwise, JSON.parse() will be used.
 *
 * @returns {Promise<any>} Returns the contents of the JSON file found
 *  with filePath, or NULL if no such file exists.
 */
export function readJsonFile(filePath: string, funcParse: Function | null = null): any | null {
	try {
		if (filePath.trim().length < 1)
			throw new Error(`The filepath is empty or invalid.`);

		const bIsExistingFile =
			fs.existsSync(filePath);

		if (!bIsExistingFile)
			return null;

		const data =  fs.readFileSync(filePath, 'utf-8');

		let parsedJsonObj;

		// Do we have a custom parse function?
		if (funcParse)
			// Yes.  Use it.
			parsedJsonObj = funcParse(data)
		else
			// No.  Just use JSON.parse()
			parsedJsonObj = JSON.parse(data);

		return parsedJsonObj
	} catch (err) {
		throw new Error(`Failed to read file: ${err.message}`);
	}
}

/**
 * Writes the given item to a JSON file.
 *
 * @param {string} filePath - The full path to the JSON file.
 * @param {any} data - The data to write to the file.
 *
 * @param funcStringify - If the data requires a custom
 *  stringify function, pass it here, otherwise
 *  JSON.stringify() will be used.
 *
 * @returns {Promise<void>}
 */
export function writeJsonFile(filePath: string, data: any, funcStringify: Function | null = null): void {
	try {
		if (filePath.trim().length < 1)
			throw new Error(`The filepath is empty or invalid.`);

		// Do we have a custom stringify function?
		let strJsonData;

		if (funcStringify)
			// Yes. Use it.
			strJsonData = funcStringify(data)
		else
			// No.  Just use JSON.stringify()
			strJsonData = JSON.stringify(data, null, 2); // Pretty-print JSON with 2 spaces

		fs.writeFileSync(filePath, strJsonData, 'utf-8');
	} catch (err) {
		throw new Error(`Failed to write file: ${err.message}`);
	}
}
