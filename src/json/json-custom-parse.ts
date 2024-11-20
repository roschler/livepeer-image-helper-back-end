// This module contains code to parse JSON output
//  from text completions in a way that tolerates
//  many of the malformed output an LLM produces.

/**
 * Interface representing the details of a property to extract from JSON.
 */
export interface PropertyDetails {
	/**
	 * The name of the property.
	 */
	propertyName: string;
	/**
	 * The type of the property: 'string', 'number', or 'boolean'.
	 */
	propertyType: string;
}

export type PropertyDetailsArrayOrNull = PropertyDetails[] | null;

/**
 * Extracts specified fields from a JSON string with tolerance for formatting issues.
 *
 * @param aryPropertyDetails - An array of PropertyDetails specifying which properties to extract.
 * @param strSimpleJson - The JSON string from which to extract properties.
 * @returns An object containing the extracted properties with their parsed values.
 * @throws Will throw an error if inputs are invalid, required properties are missing, or values cannot be parsed.
 */
export function extractJsonFieldsWithTolerance(
	aryPropertyDetails: PropertyDetails[],
	strSimpleJson: string
): Record<string, unknown> {
	// Validate inputs
	if (!Array.isArray(aryPropertyDetails) || aryPropertyDetails.length === 0) {
		throw new Error("aryPropertyDetails must be a non-empty array.");
	}

	if (typeof strSimpleJson !== "string" || strSimpleJson.trim() === "") {
		throw new Error("strSimpleJson must be a non-empty string.");
	}

	const retObj: Record<string, unknown> = {};

	// Build an array of adorned property names for matching
	const aryAdornedPropertyNames = aryPropertyDetails.map(
		(detail) => `"${detail.propertyName}":`
	);

	// Find the last closing brace in the JSON string
	const lastClosingBraceIndex = strSimpleJson.lastIndexOf("}");
	if (lastClosingBraceIndex === -1) {
		throw new Error("No closing brace found in strSimpleJson.");
	}

	// Find the first opening brace before the last closing brace
	const firstOpeningBraceIndex = strSimpleJson.lastIndexOf(
		"{",
		lastClosingBraceIndex
	);
	if (firstOpeningBraceIndex === -1) {
		throw new Error(
			"No opening brace found before the closing brace in strSimpleJson."
		);
	}

	// Extract the content between the braces
	const strImportantContent = strSimpleJson.substring(
		firstOpeningBraceIndex + 1,
		lastClosingBraceIndex
	);

	// Prepare a map for quick lookup of property details by name
	const propertyMap = new Map<string, PropertyDetails>();
	for (const detail of aryPropertyDetails) {
		propertyMap.set(detail.propertyName, detail);
	}

	// Regular expression to match property-value pairs
	const propertyPattern = /"([^"]+)"\s*:\s*(.+?)(?=,\s*"[^"]+"\s*:|$)/gs;
	let match: RegExpExecArray | null;

	// Set to keep track of found properties
	const foundProperties = new Set<string>();

	// Iterate over all matches in the important content
	while ((match = propertyPattern.exec(strImportantContent)) !== null) {
		const matchedPropertyName = match[1];
		let strPropertyValueRaw = match[2].trim();

		// Remove trailing comma if present
		if (strPropertyValueRaw.endsWith(",")) {
			strPropertyValueRaw = strPropertyValueRaw.slice(0, -1).trim();
		}

		const matchingPropertyDetails = propertyMap.get(matchedPropertyName);
		if (!matchingPropertyDetails) {
			continue; // Skip properties not specified in aryPropertyDetails
		}

		foundProperties.add(matchedPropertyName);

		const { propertyType, propertyName } = matchingPropertyDetails;

		try {
			if (propertyType === "string") {
				// Remove surrounding quotes if present
				if (
					strPropertyValueRaw.startsWith('"') &&
					strPropertyValueRaw.endsWith('"')
				) {
					strPropertyValueRaw = strPropertyValueRaw.slice(1, -1);
				}
				// Unescape any escaped quotes within the string
				strPropertyValueRaw = strPropertyValueRaw.replace(/\\"/g, '"');
				retObj[propertyName] = strPropertyValueRaw;
			} else if (propertyType === "boolean") {
				if (strPropertyValueRaw === "true") {
					retObj[propertyName] = true;
				} else if (strPropertyValueRaw === "false") {
					retObj[propertyName] = false;
				} else {
					throw new Error(
						`Invalid boolean value for property "${propertyName}": ${strPropertyValueRaw}`
					);
				}
			} else if (propertyType === "number") {
				const numberValue = Number(strPropertyValueRaw);
				if (isNaN(numberValue)) {
					throw new Error(
						`Invalid number value for property "${propertyName}": ${strPropertyValueRaw}`
					);
				}
				retObj[propertyName] = numberValue;
			} else {
				throw new Error(
					`Unsupported property type "${propertyType}" for property "${propertyName}".`
				);
			}
		} catch (error) {
			// Enhance error message with property context
			throw new Error(
				`Error processing property "${propertyName}": ${error.message}`
			);
		}
	}

	// Check for any properties that were not found in the JSON string
	for (const detail of aryPropertyDetails) {
		if (!foundProperties.has(detail.propertyName)) {
			throw new Error(
				`Property "${detail.propertyName}" not found in strSimpleJson.`
			);
		}
	}

	return retObj;
}

// -------------------- BEGIN: PRESET PROPERTY DETAILS ARRAYS ------------

// These are the fields expected to be present in a JSON
//  object output by the main image generation prompt.
export const g_AryPropertyDetails_main_image_gen_prompt: PropertyDetails[] = [
	{ propertyName: "prompt", propertyType: "string"},
	{ propertyName: "negative_prompt", propertyType: "string"},
	{ propertyName: "prompt_summary", propertyType: "string"},
	{ propertyName: "user_input_has_complaints", propertyType: "boolean"}
]


// -------------------- END  : PRESET PROPERTY DETAILS ARRAYS ------------