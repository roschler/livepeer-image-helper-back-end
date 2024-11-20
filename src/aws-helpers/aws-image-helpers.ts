// This module contains code that involves storing and
//  retrieving images to and from Amazon S3.

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import axios from "axios";
import { URL } from "url";
import {
	convertImageBufferToBase64ImageUri, detectImageFormatFromUrl,
	ImagePackage,
	retrieveImageAsJpg,
} from "../image-processing/image-handling"
import { getEnvironmentVariableByName } from "../common-routines"

const CONSOLE_CATEGORY = 'aws-image-helpers';

/**
 * Simple function to replace the "png" file extension with a
 *  ".jpg" extension.
 *
 * @param filename - The file name to modify.
 *
 * @return - Returns the file name with a JPG extension.
 */
function replacePngWithJpg(filename: string) {
	return filename.replace(/\.png$/i, '.jpg');
}

/**
 * @param s3ImageUrl - The S3 image URL whose contents is to be packaged.
 *
 * @returns - Returns a promise that resolves to a fully filled out
 *  ImagePackage object that reflects the contents of the S3 asset
 *  retrieved using the S3 image URL.
 */
async function buildExistingImagePackage(s3ImageUrl: string): Promise<ImagePackage> {

	if (s3ImageUrl.length < 1)
		throw new Error(`The S3 Image URL is empty.`);

	const imageContent = await retrieveImageAsJpg(s3ImageUrl);
	const imageFormat = detectImageFormatFromUrl(s3ImageUrl);

	const base64ImageUri = convertImageBufferToBase64ImageUri(imageContent, imageFormat);

	const existingImagePackage =
		new ImagePackage(
			s3ImageUrl,
			imageContent,
			base64ImageUri,
			imageFormat,
			s3ImageUrl);

	return existingImagePackage;
}

/**
 * Gets an image from our Amazon S3 bucket, under a user-specific folder.
 *
 * @param s3ImageUrl - The S3 image URL whose contents is to be retrieved.
 *
 * @returns - Returns a promise that resolves to an ImagePackage object
 *  if an image asset exists in our S3 bucket for the given user,
 *  or NULL if no such asset exists.
 */
export async function getImageFromS3Ext(s3ImageUrl: string): Promise<ImagePackage|null> {

	// Validate and parse s3ImageUrl
	if (!s3ImageUrl || s3ImageUrl.trim().length === 0) {
		console.error(`Invalid s3ImageUrl: '${s3ImageUrl}'`);
		throw new Error("s3ImageUrl cannot be empty.");
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(s3ImageUrl);
	} catch (err) {
		console.error(`Invalid s3ImageUrl: '${s3ImageUrl}'`);
		throw new Error("s3ImageUrl is not a valid URL.");
	}

	// Check that the protocol is HTTPS
	if (parsedUrl.protocol !== "https:") {
		console.error(`Invalid protocol for s3ImageUrl: '${s3ImageUrl}'`);
		throw new Error("s3ImageUrl must use the HTTPS protocol.");
	}

	// If the URL already is in our S3 bucket, just return it.
	if (parsedUrl.
		hostname === "nft3d-public-mp3.s3.amazonaws.com") {

		// Create a fully assembled image package object.
		return buildExistingImagePackage(s3ImageUrl);
	}

	// Extract the S3 key from the S3 URL.
	function extractS3Key(url: string) {
		const regex = /https:\/\/[^/]+\/(livepeer-images\/.+)/;
		const match = url.match(regex);
		return match ? match[1] : null;
	}

	// Set up S3 client and bucket information
	const s3 = new S3Client({ region: "us-east-1" }); // Adjust the region as needed
	const bucketName = "nft3d-public-mp3";
	const s3Key = extractS3Key(s3ImageUrl);

	if (s3Key === null || s3Key === s3ImageUrl)
		throw new Error(`The S3 image URL is invalid.  Could not extract S3 key:\n${s3ImageUrl}`);

	try {
		// Check if the object already exists in S3
		try {
			await s3.send(new HeadObjectCommand({
				Bucket: bucketName,
				Key: s3Key,
			}));

			// -------------------- BEGIN: EARLY RETURN STATEMENT ------------

			// Create a fully assembled image package object.
			return buildExistingImagePackage(s3ImageUrl);

			// -------------------- END  : EARLY RETURN STATEMENT ------------
		} catch (headError) {
			// If the object doesn't exist, the HeadObjectCommand will throw an error (usually a 404).
			// Continue with uploading the image.
			if (headError.name !== "NotFound") {
				console.warn(`No S3 object exists for the URL:\n${s3ImageUrl}\nDetails:\n${headError.message}`);
			}
		}

		// Image not found with the given S3 URL.
		return null;
	} catch (error) {
		console.error(`Error retrieving image from S3: ${error.message}`, { s3ImageUrl: s3ImageUrl });
		throw new Error(`Error retrieving image from S3: ${error.message}`);
	}
}

/**
 * Uploads an image from Livepeer to Amazon S3 under a user-specific folder,
 *  but this function converts the Livepeer PNG file to a JPG file first,
 *  and stores the smaller JPG file to S3.
 *
 * NOTE: If the URL is already one of our S3 URLs, we just return it.
 *
 * @param userId - The ID of the user to whom the image belongs.
 * @param livepeerImgOrS3Url - The Livepeer image URL or one of
 *  our S3 URLs.
 *
 * @returns - Returns a promise that resolves to an ImagePackage object
 *  instead of just the S3 URL like putLivepeerImageToS3AsJpg()
 *  returns.
 */
export async function putLivepeerImageToS3AsJpgExt(userId: string, livepeerImgOrS3Url: string): Promise<ImagePackage> {
	// Validate and trim userId
	if (!userId || userId.trim().length === 0) {
		console.error(`Invalid userId: '${userId}'`);
		throw new Error("userId cannot be empty.");
	}
	const trimmedUserId = userId.trim();

	// Validate and parse livepeerImgOrS3Url
	if (!livepeerImgOrS3Url || livepeerImgOrS3Url.trim().length === 0) {
		console.error(`Invalid livepeerImgOrS3Url: '${livepeerImgOrS3Url}'`);
		throw new Error("livepeerImgOrS3Url cannot be empty.");
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(livepeerImgOrS3Url);
	} catch (err) {
		console.error(`Invalid livepeerImgOrS3Url: '${livepeerImgOrS3Url}'`);
		throw new Error("livepeerImgOrS3Url is not a valid URL.");
	}

	// Check that the protocol is HTTPS
	if (parsedUrl.protocol !== "https:") {
		console.error(`Invalid protocol for livepeerImgOrS3Url: '${livepeerImgOrS3Url}'`);
		throw new Error("livepeerImgOrS3Url must use the HTTPS protocol.");
	}

	// If the URL is for our S3 bucket then that means its
	//  from a previous successful file save, just return it.
	if (parsedUrl.
		hostname === "nft3d-public-mp3.s3.amazonaws.com") {
		const existingImagePackage =
			new ImagePackage(
				'',
				null,
				'',
				'',
				livepeerImgOrS3Url);

		console.log(`(putLivepeerImageToS3AsJpgExt) The image URL is already one of our S3 URLs:\n${livepeerImgOrS3Url}`)
		return existingImagePackage;
	}

	// Check that the hostname is obj-store.livepeer.cloud
	if (parsedUrl.hostname !== "obj-store.livepeer.cloud") {
		console.error(`Invalid host for livepeerImgOrS3Url: '${livepeerImgOrS3Url}'`);
		throw new Error("livepeerImgOrS3Url must have the host 'obj-store.livepeer.cloud'.");
	}

	// Extract the image filename from the URL path
	const pathParts = parsedUrl.pathname.split("/");
	const filenamePng = pathParts.slice(-2).join("/"); // Last two parts of the path form the filename
	if (!filenamePng) {
		console.error(`Failed to extract filename from livepeerImgOrS3Url: '${livepeerImgOrS3Url}'`);
		throw new Error("Invalid livepeerImgOrS3Url format, could not extract image filename.");
	}

	// Change the file name to a JPG extension.
	const filenameJpg = replacePngWithJpg(filenamePng);

	// Set up S3 client and bucket information
	const s3 = new S3Client({ region: "us-east-1" }); // Adjust the region as needed
	const bucketName = "nft3d-public-mp3";
	const s3Key = `livepeer-images/${trimmedUserId}/${filenameJpg}`;

	try {
		// Check if the object already exists in S3
		try {
			await s3.send(new HeadObjectCommand({
				Bucket: bucketName,
				Key: s3Key,
			}));

			// If it exists, return the existing S3 URI
			const existingS3Uri = `https://${bucketName}.s3.amazonaws.com/${s3Key}`;
			console.log(`(putLivepeerImageToS3AsJpgExt) S3 object already exists: ${existingS3Uri}`);

			// -------------------- BEGIN: EARLY RETURN STATEMENT ------------

			const existingImagePackage =
				new ImagePackage(
					'',
					null,
					'',
					'',
					existingS3Uri);

			return existingImagePackage;

			// -------------------- END  : EARLY RETURN STATEMENT ------------
		} catch (headError) {
			// If the object doesn't exist, the HeadObjectCommand will throw an error (usually a 404).
			// Continue with uploading the image.
			if (headError.name !== "NotFound") {
				console.error(`Error checking if S3 object exists: ${headError.message}`);
				throw new Error(`Failed to check if S3 object exists: ${headError.message}`);
			}
		}

		// Retrieve image content from Livepeer as a JPG.
		const imageContent = await retrieveImageAsJpg(livepeerImgOrS3Url);

		console.log(`(putLivepeerImageToS3AsJpgExt) Converted PNG to JPG.  Saving it to S3 now:\n${livepeerImgOrS3Url}`);

		// Upload the image content to S3
		await s3.send(new PutObjectCommand({
			Bucket: bucketName,
			Key: s3Key,
			Body: imageContent,
			ContentType: "image/jpeg",
		}));

		// Return the full S3 URI to the newly uploaded asset in an ImagePackage
		// object.
		const s3Uri = `https://${bucketName}.s3.amazonaws.com/${s3Key}`;

		console.log(`(putLivepeerImageToS3AsJpgExt) JPG saved.  S3 URL is:\n${s3Uri}`);

		const newImagePackage =
			new ImagePackage(
				livepeerImgOrS3Url,
				imageContent,
				'',
				'',
				s3Uri
			);

		return newImagePackage;
	} catch (error) {
		console.error(`Error uploading image to S3: ${error.message}`, { userId, livepeerImgUrl: livepeerImgOrS3Url });
		throw new Error(`Failed to upload image to S3: ${error.message}`);
	}
}

/**
 * Uploads an image from Livepeer to Amazon S3 under a user-specific folder,
 *  but this function converts the Livepeer PNG file to a JPG file first,
 *  and stores the smaller JPG file to S3.
 *
 * @param {string} userId - The ID of the user to whom the image belongs.
 * @param {string} livepeerImgUrl - The Livepeer image URL.
 *
 * @returns {Promise<string>} - The full S3 URI to the new asset or existing object.
 */
export async function putLivepeerImageToS3AsJpg(userId: string, livepeerImgUrl: string): Promise<string> {
	const result = await putLivepeerImageToS3AsJpgExt(userId, livepeerImgUrl);

	return result.urlToSrcImage;
}


/**
 * Uploads an image from Livepeer to Amazon S3 under a user-specific folder.
 *
 *  This is the original call which we have left intact instead of
 *   making a call to putLivepeerImageToS3AsJpgExt().
 *
 * @param {string} userId - The ID of the user to whom the image belongs.
 * @param {string} livepeerImgOrS3Url - The Livepeer image URL or one
 *  of our S3 URLs.
 *
 * @returns {Promise<string>} - The full S3 URI to the new asset or
 *  existing object.
 */
export async function putLivepeerImageToS3(
		userId: string,
		livepeerImgOrS3Url: string): Promise<string> {
	// Validate and trim userId
	if (!userId || userId.trim().length === 0) {
		console.error(`Invalid userId: '${userId}'`);
		throw new Error("userId cannot be empty.");
	}
	const trimmedUserId = userId.trim();

	// Validate and parse livepeerImgOrS3Url
	if (!livepeerImgOrS3Url || livepeerImgOrS3Url.trim().length === 0) {
		console.error(`Invalid livepeerImgUrl: '${livepeerImgOrS3Url}'`);
		throw new Error("livepeerImgOrS3Url cannot be empty.");
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(livepeerImgOrS3Url);
	} catch (err) {
		console.error(`Invalid livepeerImgUrl: '${livepeerImgOrS3Url}'`);
		throw new Error("livepeerImgOrS3Url is not a valid URL.");
	}

	// Check that the protocol is HTTPS
	if (parsedUrl.protocol !== "https:") {
		console.error(`Invalid protocol for livepeerImgUrl: '${livepeerImgOrS3Url}'`);
		throw new Error("livepeerImgOrS3Url must use the HTTPS protocol.");
	}

	// If the URL already is in our S3 bucket, just return it.
	if (parsedUrl.
		hostname === "nft3d-public-mp3.s3.amazonaws.com") {
		return livepeerImgOrS3Url;
	}

	// Check that the hostname is obj-store.livepeer.cloud
	if (parsedUrl.hostname !== "obj-store.livepeer.cloud") {
		console.error(`Invalid host for livepeerImgUrl: '${livepeerImgOrS3Url}'`);
		throw new Error("livepeerImgOrS3Url must have the host 'obj-store.livepeer.cloud'.");
	}

	// Extract the image filename from the URL path
	const pathParts = parsedUrl.pathname.split("/");
	const filename = pathParts.slice(-2).join("/"); // Last two parts of the path form the filename
	if (!filename) {
		console.error(`Failed to extract filename from livepeerImgUrl: '${livepeerImgOrS3Url}'`);
		throw new Error("Invalid livepeerImgOrS3Url format, could not extract image filename.");
	}

	// Set up S3 client and bucket information
	const s3 = new S3Client({ region: "us-east-1" }); // Adjust the region as needed
	const bucketName = "nft3d-public-mp3";
	const s3Key = `livepeer-images/${trimmedUserId}/${filename}`;

	try {
		// Check if the object already exists in S3
		try {
			await s3.send(new HeadObjectCommand({
				Bucket: bucketName,
				Key: s3Key,
			}));

			// If it exists, return the existing S3 URI
			const existingS3Uri = `https://${bucketName}.s3.amazonaws.com/${s3Key}`;
			console.log(`(putLivepeerImageToS3) S3 object already exists: ${existingS3Uri}`);

			// -------------------- BEGIN: EARLY RETURN STATEMENT ------------

			return existingS3Uri;

			// -------------------- END  : EARLY RETURN STATEMENT ------------
		} catch (headError) {
			// If the object doesn't exist, the HeadObjectCommand will throw an error (usually a 404).
			// Continue with uploading the image.
			if (headError.name !== "NotFound") {
				console.error(`Error checking if S3 object exists: ${headError.message}`);
				throw new Error(`Failed to check if S3 object exists: ${headError.message}`);
			}
		}

		// Retrieve image content from Livepeer
		const response = await axios.get(livepeerImgOrS3Url, { responseType: "arraybuffer" });
		const imageContent = response.data;

		// Upload the image content to S3
		await s3.send(new PutObjectCommand({
			Bucket: bucketName,
			Key: s3Key,
			Body: imageContent,
			ContentType: "image/png", // Assuming the image is PNG. Modify if needed.
		}));

		// Return the full S3 URI to the newly uploaded asset
		const s3Uri = `https://${bucketName}.s3.amazonaws.com/${s3Key}`;
		return s3Uri;

	} catch (error) {
		console.error(`Error uploading image to S3: ${error.message}`, { userId, livepeerImgUrl: livepeerImgOrS3Url });
		throw new Error(`Failed to upload image to S3: ${error.message}`);
	}
}

/**
 * DEPRECATED: The client now does this part.  The back-end server
 *  just makes and services the Twitter card URL.
 *
 * Builds a Twitter share URL with pre-filled tweet text, a link to the Twitter card, and hashtags.
 *
 * @param {string} postText - The text content of the tweet. Must be a non-empty string.
 * @param {string} imageUrl - The URL of the image to share (direct URL to the S3 image).
 * @param {string[]} aryHashTags - An array of hashtags (without the # symbol). Must be non-empty and properly trimmed.
 * @param {string} title - The title for the Twitter card. Must be a non-empty string.
 * @param {string} description - The description for the Twitter card. Must be a non-empty string.
 * @param {string} [card="summary_large_image"] - The type of Twitter card. Defaults to "summary_large_image".
 * @returns {string} - The generated Twitter share URL.
 * @throws {Error} If any of the input parameters are invalid (empty strings, invalid URLs, or non-HTTPS protocols).
 */
export function buildImageShareForTwitterUrl(
	postText: string,
	imageUrl: string, // This is the S3 image URL
	aryHashTags: string[],
	title: string,
	description: string,
	card: string = "summary_large_image" // Default Twitter Card type
): string {

	// Validate postText
	if (!postText || postText.trim().length === 0) {
		throw new Error("postText cannot be an empty string.");
	}

	// Validate imageUrl
	if (!imageUrl || imageUrl.trim().length === 0) {
		throw new Error("imageUrl cannot be an empty string.");
	}

	// Ensure imageUrl is a valid URL and uses HTTPS protocol
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(imageUrl);
	} catch (err) {
		throw new Error(`imageUrl is not a valid URL: ${imageUrl}`);
	}
	if (parsedUrl.protocol !== "https:") {
		throw new Error(`imageUrl must use the HTTPS protocol: ${imageUrl}`);
	}

	// Validate title
	if (!title || title.trim().length === 0) {
		throw new Error("title cannot be an empty string.");
	}

	// Validate description
	if (!description || description.trim().length === 0) {
		throw new Error("description cannot be an empty string.");
	}

	// Validate card
	if (!card || card.trim().length === 0) {
		throw new Error("card cannot be an empty string.");
	}

	// Twitter intent/tweet base URL
	const twitterShareBaseUrl = "https://twitter.com/intent/tweet";

	// Construct the full URL to open the Twitter share dialog
	//  with the embedded twitterCardUrl that sends the Twitter
	//  share intent server to our GET URL for Twitter card
	//  metadata.

	// Base URL for your Fastify route that serves the Twitter Card metadata
	let twitterCardHostOurs = getEnvironmentVariableByName("TWITTER_CARD_BASE_URL") || 'https://plasticeducator.com';

	// Validate, trim, and encode hashtags (comma-separated)
	const hashtagsParam = aryHashTags.length > 0
		? `&hashtags=${encodeURIComponent(
			aryHashTags
				.map(tag => tag.trim())  // Trim each hashtag
				.filter(tag => tag.length > 0)  // Filter out empty strings
				.join(',')
		)}`
		: '';

	// Create the URL pointing to your Fastify route, which will serve up the metadata for the Twitter Card
	const twitterCardUrl = `${twitterCardHostOurs}/twitter-card/${parsedUrl.pathname.split('/').pop()}?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}&card=${encodeURIComponent(card)}&imageUrl=${encodeURIComponent(imageUrl)}${hashtagsParam}`;

	/*

	// Encode the tweet text (postText) separately from the URL
	const textParam = `text=${encodeURIComponent(postText)}`;

	// Include the twitterCardUrl as the URL query parameter (Twitter will use this to fetch metadata)
	const urlParam = `&url=${encodeURIComponent(twitterCardUrl)}`;

	// Validate, trim, and encode hashtags (comma-separated)
	const hashtagsParam = aryHashTags.length > 0
		? `&hashtags=${encodeURIComponent(
			aryHashTags
				.map(tag => tag.trim())  // Trim each hashtag
				.filter(tag => tag.length > 0)  // Filter out empty strings
				.join(',')
		)}`
		: '';

	// Construct and return the full Twitter intent URL
	const fullShareUrl = `${twitterShareBaseUrl}?${textParam}${urlParam}${hashtagsParam}`;

	 */

	// Include the twitterCardUrl as the URL query parameter (Twitter will use this to fetch metadata)
	const urlParam = `url=${twitterCardUrl}`;

	// When a Twitter card is used, it replaces the other Twitter share
	//  intent query arguments so only the URL parameter should be
	//  included.
	const fullShareUrl = `${twitterShareBaseUrl}?${urlParam}`;

	console.info(CONSOLE_CATEGORY, `Full Twitter share URL built:\n${fullShareUrl}`)

	return fullShareUrl
}

