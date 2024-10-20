// This file contains code to analyze images with Amazon's
//  Rekognition service.

import AWS from 'aws-sdk';
import fs from 'fs';

/**
 * Analyze a local image file using Amazon Rekognition.
 *
 * @param {string} imagePath - The path to the local image file.
 * @returns {Promise<void>} - The promise that resolves when Rekognition is done.
 */
async function analyzeImageWithRekognition(imagePath: string): Promise<void> {
	const errPrefix = '(analyzeImageWithRekognition) ';

	// Read the image file into a buffer
	const imageBuffer: Buffer = fs.readFileSync(imagePath);

	// Create Rekognition parameters
	const params: AWS.Rekognition.DetectLabelsRequest = {
		Image: {
			Bytes: imageBuffer,  // Send the image as bytes directly
		},
		MaxLabels: 10,
		MinConfidence: 70
	};

	try {
		// Call Rekognition to detect labels
		const rekognition = new AWS.Rekognition();
		const result: AWS.Rekognition.DetectLabelsResponse = await rekognition.detectLabels(params).promise();
		console.log('Detected labels:', result.Labels);
	} catch (error) {
		throw new Error(`${errPrefix}Rekognition error: ${error.message}`);
	}
}

/*
// Example usage
const imagePath: string = './output/object-1.jpg';
analyzeImageWithRekognition(imagePath)
	.then(() => console.log('Image analyzed successfully.'))
	.catch((err) => console.error('Error analyzing image:', err));
*/