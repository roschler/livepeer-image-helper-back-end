// This module contains code that involves storing and
//  retrieving images to and from Amazon S3.

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import axios from "axios";
import { URL } from "url";

const CONSOLE_CATEGORY = 'aws-image-helpers';

/**
 * Uploads an image from Livepeer to Amazon S3 under a user-specific folder.
 *
 * @param {string} userId - The ID of the user to whom the image belongs.
 * @param {string} livepeerImgUrl - The Livepeer image URL.
 *
 * @returns {Promise<string>} - The full S3 URI to the new asset or existing object.
 */
export async function putLivepeerImageToS3(userId: string, livepeerImgUrl: string): Promise<string> {
	// Validate and trim userId
	if (!userId || userId.trim().length === 0) {
		console.error(`Invalid userId: '${userId}'`);
		throw new Error("userId cannot be empty.");
	}
	const trimmedUserId = userId.trim();

	// Validate and parse livepeerImgUrl
	if (!livepeerImgUrl || livepeerImgUrl.trim().length === 0) {
		console.error(`Invalid livepeerImgUrl: '${livepeerImgUrl}'`);
		throw new Error("livepeerImgUrl cannot be empty.");
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(livepeerImgUrl);
	} catch (err) {
		console.error(`Invalid livepeerImgUrl: '${livepeerImgUrl}'`);
		throw new Error("livepeerImgUrl is not a valid URL.");
	}

	// Check that the protocol is HTTPS
	if (parsedUrl.protocol !== "https:") {
		console.error(`Invalid protocol for livepeerImgUrl: '${livepeerImgUrl}'`);
		throw new Error("livepeerImgUrl must use the HTTPS protocol.");
	}

	// Check that the hostname is obj-store.livepeer.cloud
	if (parsedUrl.hostname !== "obj-store.livepeer.cloud") {
		console.error(`Invalid host for livepeerImgUrl: '${livepeerImgUrl}'`);
		throw new Error("livepeerImgUrl must have the host 'obj-store.livepeer.cloud'.");
	}

	// Extract the image filename from the URL path
	const pathParts = parsedUrl.pathname.split("/");
	const filename = pathParts.slice(-2).join("/"); // Last two parts of the path form the filename
	if (!filename) {
		console.error(`Failed to extract filename from livepeerImgUrl: '${livepeerImgUrl}'`);
		throw new Error("Invalid livepeerImgUrl format, could not extract image filename.");
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
			console.log(`S3 object already exists: ${existingS3Uri}`);

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
		const response = await axios.get(livepeerImgUrl, { responseType: "arraybuffer" });
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
		console.error(`Error uploading image to S3: ${error.message}`, { userId, livepeerImgUrl });
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
	let twitterCardHostOurs = process.env.TWITTER_CARD_BASE_URL || 'https://plasticeducator.com';

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

