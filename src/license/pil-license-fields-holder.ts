import { promises as fs } from 'fs';



// -------------------- BEGIN: PIL TYPES ------------

// Define a type for individual PIL fields
interface PilField {
	title: string;
	description: string;
	usage: string;
	example: string;
	data_type: string;
}

// Define a type for the array of PIL fields
type PilFieldsArray = PilField[];


// -------------------- END  : PIL TYPES ------------


// -------------------- BEGIN: PIL HOLDER CLASS ------------

/**
 * Class representing a collection of programmable IP license (PIL) field descriptions.
 */
export class PilFieldsDescribed {
	/**
	 * Array holding the described PIL fields.
	 */
	public aryPilFields: PilFieldsArray = [];

	/**
	 * Creates an instance of PilFieldsDescribed.
	 * Loads the PIL field descriptions from the specified JSON file into aryPilFields.
	 * @param {string} jsonFilePath - The path to the JSON file containing the PIL fields descriptions.
	 */
	constructor(private jsonFilePath: string) {}

	/**
	 * Loads the PIL fields descriptions from the JSON file into aryPilFields.
	 * @returns {Promise<void>} - A promise that resolves when the data is loaded.
	 * @throws {Error} - Throws an error if the JSON file cannot be read or parsed.
	 */
	public async loadFields(): Promise<void> {
		try {
			const data = await fs.readFile(this.jsonFilePath, 'utf-8');
			this.aryPilFields = JSON.parse(data);
		} catch (error) {
			throw new Error(`Failed to load PIL fields: ${error.message}`);
		}
	}

	/**
	 * Retrieves the field description by its title.
	 * @param {string} title - The title of the field to retrieve.
	 * @returns {PilField | undefined} - The PIL field description or undefined if not found.
	 */
	public getFieldByTitle(title: string): PilField | undefined {
		return this.aryPilFields.find((field) => field.title === title);
	}

	/**
	 * Retrieves all fields that have the specified data type.
	 * @param {string} dataType - The data type to filter by.
	 * @returns {PilFieldsArray} - An array of PIL fields that match the data type.
	 */
	public getFieldsByDataType(dataType: string): PilFieldsArray {
		return this.aryPilFields.filter((field) => field.data_type === dataType);
	}
}


// -------------------- END  : PIL HOLDER CLASS ------------


/*
// Example usage
(async () => {
	const pilFields = new PilFieldsDescribed('path/to/pil-license-fields-described.json');

	try {
		await pilFields.loadFields();
		console.log(pilFields.aryPilFields); // Logs all the PIL fields
		const specificField = pilFields.getFieldByTitle('transferable');
		console.log(specificField); // Logs details for the 'transferable' field
	} catch (error) {
		console.error(error);
	}
})();
*/