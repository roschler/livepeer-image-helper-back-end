// This module contains helper code for dealing with images.

/**
 * Converts an image from a given URL to a Base64-encoded JPEG data URI.
 *
 * @param {string} url - The URL of the image to convert.
 *
 * @returns {Promise<string>} - A promise that resolves to a Base64-encoded JPEG data URI.
 *
 */
import axios from 'axios';
import sharp from 'sharp';

export type BufferOrNull = Buffer | null;

/**
 * This is a simple class object to bind some image
 *  elements together.
 *
 * NOTE: Not all fields may be filled in!  That is
 *  why there are no validations on the field.
 */
export class ImagePackage {

	/**
	 * The URL to an external image file that was the
	 *  original source of the image content.
	 */
	public urlToSrcImage: string;

	/**
	 * The contents of the image in Buffer object format.
	 *
	 * NOTE: This field will be NULL if it is not used OR
	 *  if the object creator is passing back an existing
	 *  URL and does not want to fetch the contents of
	 *  that image unnecessarily.
	 */
	public imageBuffer: BufferOrNull;

	/**
	 * The image file content in a base64 encoded string.
	 */
	public base64EncodedImageString: string;

	/**
	 * The image URI compatible format string. (E.g. - 'jpeg', or 'png', etc.)
	 */
	public imageFormat: string;

	/**
	 * This is the URL to the S3 image object that we saved
	 *  the image to during processing.
	 */
	public urlToOurS3Image: string;

	/**
	 * @constructor
	 */
	constructor(
		urlToSrcImage: string,
		imageBuffer: BufferOrNull,
		base64EncodedImageString: string,
		imageFormat: string,
		urlToOurS3Image: string
	) {
		this.urlToSrcImage = urlToSrcImage;
		this.imageBuffer = imageBuffer;
		this.base64EncodedImageString = base64EncodedImageString;
		this.imageFormat = imageFormat;
		this.urlToOurS3Image = urlToOurS3Image;
	}
}

/**
 * Given the response.data contents returned by an AXIOS file
 *  retrieval, convert it to JPG, but only if it is not already
 *  in JPG format.
 *
 * @param responseData - The response.data content from an
 *  AXIOS call.
 *
 * @returns - Returns a Buffer object with the image data in
 *  JPG format.
 */
export async function convertImageToJpgAsNeeded(responseData: Buffer) {
	try {
		// Initialize sharp with the image buffer
		const imageSharp = sharp(responseData);

		// Retrieve metadata to check the image format
		const metadata = await imageSharp.metadata();

		// If the image is already JPEG, directly encode to Base64 without re-encoding
		let imageBuffer: Buffer;

		if (metadata.format === 'jpeg') {
			imageBuffer = responseData;
		} else {
			// Convert to JPEG if it’s not already in JPEG format
			imageBuffer = await imageSharp.jpeg().toBuffer();
		}

		return imageBuffer;
	} catch (error) {
		console.error('Error converting image to JPEG format:', error);
		throw new Error('Image conversion failed. Please ensure the URL is valid and accessible.');
	}
}

/**
 * Retrieve an image from a given URL and return in JPEG format.
 *   If the image is already in JPEG format, it skips re-encoding.
 *
 * @param url - The URL of the image to convert.
 *
 * @returns - A promise that resolves to a Buffer object
 *  containing the image in JPG format.
 *
 */
export async function retrieveImageAsJpg(url: string): Promise<Buffer> {
	// Validate the input URL
	if (!url || typeof url !== 'string') {
		throw new Error('A valid image URL must be provided as a string.');
	}

	try {
		// Fetch the image from the URL
		const response = await axios.get(url, {
			responseType: 'arraybuffer',
		});

		if (!response.data) {
			throw new Error('Failed to fetch image data from the provided URL.');
		}

		const result =
			await convertImageToJpgAsNeeded(response.data);

		return result;
	} catch (error) {
		console.error('Error retrieving image and/or converting it to JPEG format:', error);
		throw new Error('Image retrieval and/or conversion failed. Please ensure the URL is valid and accessible.');
	}
}

/**
 * Retrieves and image and then converts an image from a given URL
 *  to a Base64-encoded JPEG data URI. If the image is already in
 *  JPEG format, it skips re-encoding.
 *
 * @param imageBuffer - An image in Buffer object format.
 * @param imageFmt - The image format the image buffer is in.
 *
 * @returns - Returns the buffer object as a  Base64-encoded JPEG
 *  data URI.
 *
 */
export function convertImageBufferToBase64ImageUri(imageBuffer: Buffer, imageFmt: string): string {
	try {
		// Encode the image buffer to a Base64 string
		const base64Image = imageBuffer.toString('base64');

		// Construct the data URI
		const dataUri = `data:image/${imageFmt};base64,${base64Image}`;
		return dataUri;

	} catch (error) {
		console.error('Error converting image to Base64:', error);
		throw new Error('Image conversion failed. Please ensure the URL is valid and accessible.');
	}
}

/**
 * Retrieves and image and then converts an image from a given URL
 *  to a Base64-encoded JPEG data URI. If the image is already in
 *  JPEG format, it skips re-encoding.
 *
 * @param {string} url - The URL of the image to convert.
 *
 * @returns {Promise<string>} - A promise that resolves to a
 *  Base64-encoded JPEG data URI.
 *
 */
export async function retrieveAndConvertImageToBase64ImageUri_jpg(url: string): Promise<string> {
	// Validate the input URL
	if (!url || typeof url !== 'string') {
		throw new Error('A valid image URL must be provided as a string.');
	}

	try {
		// Get the image in JPG format as Buffer object.
		const imageBufferJpg =
			await retrieveImageAsJpg(url);

		// Encode the image buffer to a Base64 string
		const base64Image = convertImageBufferToBase64ImageUri(imageBufferJpg, 'jpeg');

		return base64Image;
	} catch (error) {
		console.error('Error retrieving image or converting image to Base64 JPG string:', error);
		throw new Error('Image retrieval and/or conversion failed. Please ensure the URL is valid and accessible.');
	}
}

/**
 * This function does a simple test to determine the image
 *  format for a given URL by its file extension.
 *
 * @param urlToImage - The URL to analyze.
 *
 * @return - Returns an image format designator.
 */
export function detectImageFormatFromUrl(urlToImage: string) {
	let imageFormat;

	if (urlToImage.length < 1)
		throw new Error(`The image URL is empty.`);

	if (urlToImage.endsWith('jpg'))
		imageFormat = 'jpeg'
	else if (urlToImage.endsWith('jpeg'))
		imageFormat = 'jpeg'
	else if (urlToImage.endsWith('jpeg'))
		imageFormat = 'png'
	else {
		throw new Error(`URL does not contain a known image format: ${urlToImage}`);
	}

	return imageFormat;
}

// END:


// Example usage
/*
(async () => {
	const imageUrl = 'https://example.com/image.png'; // Replace with a real image URL
	try {
		const base64DataUri = await convertImageToBase64(imageUrl);
		console.log(base64DataUri); // Logs the Base64 data URI for the image
	} catch (error) {
		console.error(error);
	}
})();
*/